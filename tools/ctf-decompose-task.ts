import { tool } from "@opencode-ai/plugin"

type ChallengeInput = {
  category: string
  target: string
  sourcePath?: string
  description?: string
  dockerfile?: string
  libc?: string
  binary?: string
}

type WorkStream = {
  id: string
  name: string
  description: string
  skills: string[]
  canRunParallel: boolean
  dependsOn: string[]
  estimatedDuration: "quick" | "medium" | "long"
  agentPrompt: string
  outputContract: string
  killCondition: string
}

type Decomposition = {
  challengeTag: string
  category: string
  phaseCount: number
  waves: {
    wave: number
    streams: WorkStream[]
    synthesisQuestion: string
  }[]
  strategySummary: string
  riskBudget: { requests: number; concurrency: number }
}

function classifyDecomposition(input: ChallengeInput): Decomposition {
  const cat = input.category.toLowerCase()
  const tag = input.target.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 32) || "ctf-challenge"

  if (cat === "web") return webDecomposition(tag, input)
  if (cat === "pwn") return pwnDecomposition(tag, input)
  if (cat === "crypto") return cryptoDecomposition(tag, input)
  if (cat === "rev" || cat === "reverse") return revDecomposition(tag, input)
  if (cat === "forensics" || cat === "forensic") return forensicsDecomposition(tag, input)

  // generic / misc / unknown
  return genericDecomposition(tag, input)
}

function webDecomposition(tag: string, input: ChallengeInput): Decomposition {
  const hasSource = !!input.sourcePath
  return {
    challengeTag: tag,
    category: "web",
    phaseCount: 3,
    waves: [
      {
        wave: 1,
        synthesisQuestion: "Which attack surface(s) look most promising? What tech stack and framework was identified?",
        streams: [
          {
            id: `${tag}-w1-recon`,
            name: "Black-box Recon",
            description: "Map HTTP routes, methods, parameters, cookies, headers, JS endpoints, and auth boundaries",
            skills: ["ctf-web", "ctf-web > blackbox-first-pass"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "medium",
            agentPrompt: `Perform black-box recon on ${input.target}. Map all routes, headers, cookies, forms, JS endpoints, and auth boundaries. Tech fingerprint the stack. Record all entry points.${hasSource ? ` Source available at ${input.sourcePath} — correlate source routes with observed behavior.` : ""}`,
            outputContract: "JSON array of { route, method, authRequired, inputParams, techHints }",
            killCondition: "All routes mapped with no new endpoints after 3 probe rounds",
          },
          {
            id: `${tag}-w1-source`,
            name: "Source Audit",
            description: "Analyze source for sinks, secrets, auth bypasses, templates, and dependency risks",
            skills: ["ctf-whitebox-audit", "ctf-web-source-map"],
            canRunParallel: !hasSource,
            dependsOn: [],
            estimatedDuration: hasSource ? "medium" : "quick",
            agentPrompt: hasSource
              ? `Audit the source at ${input.sourcePath}. Map all: entrypoints, sinks (command/file/sql/ssrf/template/deser), secrets, auth boundaries, and dependency risks. Output structured findings.`
              : "No source available — skip source audit",
            outputContract: "JSON array of { type, file, line, description, severity, confidence }",
            killCondition: !hasSource ? "skip" : "All files reviewed or 3 high-confidence findings found",
          },
          {
            id: `${tag}-w1-fingerprint`,
            name: "Tech Fingerprint + CVE Research",
            description: "Identify framework, libraries, known CVEs, and common CTF patterns",
            skills: ["ctf-skill-repo-knowledge", "ctf-web > pattern recall gate"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "medium",
            agentPrompt: `Fingerprint the technology stack at ${input.target}. Check for known CTF patterns, CVEs, and framework-specific vulnerabilities. Search CTF pattern cards for relevant techniques.${hasSource ? ` Source dependencies at ${input.sourcePath}` : ""}`,
            outputContract: "JSON array of { tech, version, knownVulns, ctfPatterns, confidence }",
            killCondition: "Stack identified and top 3 vulnerability patterns checked",
          },
        ],
      },
      {
        wave: 2,
        synthesisQuestion: "Which vulnerability class confirmed? What's the shortest path to flag?",
        streams: [
          {
            id: `${tag}-w2-probe1`,
            name: "Focused Probe — Primary Candidate",
            description: "Deep probe of the highest-confidence attack candidate",
            skills: ["ctf-web > focused-probe"],
            canRunParallel: true,
            dependsOn: [`${tag}-w1-recon`, `${tag}-w1-source`, `${tag}-w1-fingerprint`],
            estimatedDuration: "medium",
            agentPrompt:
              "Execute focused probe on the primary attack candidate. Use minimal probes — 3 variants max per payload family. Prove or disprove the hypothesis.",
            outputContract: "{ hypothesis, verdict, evidence, primitive, followUp }",
            killCondition: "After 3 same-family probes with no new differential, or confirmed primitive",
          },
          {
            id: `${tag}-w2-probe2`,
            name: "Focused Probe — Secondary Candidate",
            description: "Parallel probe of the second-best attack candidate",
            skills: ["ctf-web > focused-probe"],
            canRunParallel: true,
            dependsOn: [`${tag}-w1-recon`, `${tag}-w1-source`, `${tag}-w1-fingerprint`],
            estimatedDuration: "medium",
            agentPrompt:
              "Execute focused probe on the secondary attack candidate. Use minimal probes. Prove or disprove.",
            outputContract: "{ hypothesis, verdict, evidence, primitive, followUp }",
            killCondition: "After 3 same-family probes with no new differential, or confirmed primitive",
          },
        ],
      },
      {
        wave: 3,
        synthesisQuestion: "Is the exploit chain working? Is the flag captured?",
        streams: [
          {
            id: `${tag}-w3-chain`,
            name: "Exploit Chain Construction",
            description: "Build the shortest stable exploit chain and capture the flag",
            skills: ["ctf-web > final-chain"],
            canRunParallel: false,
            dependsOn: [`${tag}-w2-probe1`, `${tag}-w2-probe2`],
            estimatedDuration: "medium",
            agentPrompt:
              "Build the exploit chain from confirmed primitives. Write solve.py that captures the flag. Verify flag and write to agent_flag.txt.",
            outputContract: "solve.py script + flag string",
            killCondition: "Flag captured and verified, or chain proven impossible",
          },
        ],
      },
    ],
    strategySummary: `3-wave web assault on ${input.target}. Wave 1: concurrent recon+source+fingerprint. Wave 2: concurrent probes on top 2 candidates. Wave 3: chain construction.`,
    riskBudget: { requests: 50, concurrency: 3 },
  }
}

function pwnDecomposition(tag: string, input: ChallengeInput): Decomposition {
  const hasSource = !!input.sourcePath
  const hasBinary = !!input.binary
  const hasLibc = !!input.libc
  return {
    challengeTag: tag,
    category: "pwn",
    phaseCount: 3,
    waves: [
      {
        wave: 1,
        synthesisQuestion: "What's the exploit bucket? What are the protections and primitives?",
        streams: [
          {
            id: `${tag}-w1-triage`,
            name: "Binary Triage",
            description: "checksec, file, strings, decompilation, protection analysis",
            skills: ["ctf-pwn"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "quick",
            agentPrompt: `Triage the binary at ${input.binary || input.target}. Run checksec, file, strings, and decompilation. Report: architecture, protections (canary/PIE/NX/RELRO), symbol table, interesting strings.${hasLibc ? ` Libc at ${input.libc}` : ""}`,
            outputContract: "{ arch, protections, symbols, interestingStrings, exploitBucket }",
            killCondition: "Protections and exploit bucket identified",
          },
          {
            id: `${tag}-w1-source`,
            name: "Source / Disassembly Review",
            description: "Find vulnerability functions and control flow paths",
            skills: ["ctf-whitebox-audit"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: hasSource ? "medium" : "long",
            agentPrompt: hasSource
              ? `Audit source at ${input.sourcePath} for vuln functions (gets, printf, read, malloc/free patterns, etc.)`
              : `Decompile the binary and identify vulnerable functions, control flow, and attack surface`,
            outputContract: "JSON array of { vulnType, function, offset, description }",
            killCondition: "Top 3 vulnerability candidates identified or source fully reviewed",
          },
          {
            id: `${tag}-w1-libc`,
            name: "Libc Resolution",
            description: "Identify libc version, symbols, offsets, one_gadgets",
            skills: ["ctf-pwn", "ctf-pwn-libc-resolver"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "quick",
            agentPrompt: `Identify libc version and resolve key symbols.${hasLibc ? ` Libc at ${input.libc}` : ""} Find: system, execve, /bin/sh, one_gadgets, __free_hook, __malloc_hook offsets.`,
            outputContract: "{ libcVersion, symbols: { system, binsh, etc }, oneGadgets, base }",
            killCondition: "libc version identified and key symbols resolved",
          },
        ],
      },
      {
        wave: 2,
        synthesisQuestion: "Do we have control + leak? What closure family?",
        streams: [
          {
            id: `${tag}-w2-control`,
            name: "Crash Probe & Control",
            description: "Find offset, confirm IP control, establish overflow primitive",
            skills: ["ctf-pwn"],
            canRunParallel: true,
            dependsOn: [`${tag}-w1-triage`, `${tag}-w1-source`],
            estimatedDuration: "medium",
            agentPrompt: "Prove control: cyclic pattern → offset → IP control. Confirm with debugger or crash output.",
            outputContract: "{ offset, controlledRegisters, crashType }",
            killCondition: "Offset confirmed with debugger evidence",
          },
          {
            id: `${tag}-w2-leak`,
            name: "Leak Primitive",
            description: "Establish leak primitive for ASLR/bypass (format string, GOT leak, etc.)",
            skills: ["ctf-pwn"],
            canRunParallel: true,
            dependsOn: [`${tag}-w1-triage`, `${tag}-w1-source`],
            estimatedDuration: "medium",
            agentPrompt:
              "Find and confirm a leak primitive. Format string, GOT read, uninitialized memory, stdout file struct, etc.",
            outputContract: "{ leakType, leakedValue, baseCalculated, reliability }",
            killCondition: "Leak confirmed and base address calculated, or proven impossible",
          },
        ],
      },
      {
        wave: 3,
        synthesisQuestion: "Exploit working? Flag captured?",
        streams: [
          {
            id: `${tag}-w3-exploit`,
            name: "Exploit Construction",
            description: "Build final exploit with ROP/shellcode/heap technique and capture flag",
            skills: ["ctf-pwn"],
            canRunParallel: false,
            dependsOn: [`${tag}-w2-control`, `${tag}-w2-leak`],
            estimatedDuration: "long",
            agentPrompt:
              "Build the final exploit. Use templates/ as starting point. Verify locally first, then adapt to remote. Write solve.py and capture flag.",
            outputContract: "solve.py + flag string",
            killCondition: "Flag captured and verified",
          },
        ],
      },
    ],
    strategySummary: `3-wave pwn chain on ${input.binary || input.target}. Wave 1: concurrent triage+source+libc. Wave 2: concurrent control+leak. Wave 3: exploit construction.`,
    riskBudget: { requests: 30, concurrency: 2 },
  }
}

function cryptoDecomposition(tag: string, input: ChallengeInput): Decomposition {
  return {
    challengeTag: tag,
    category: "crypto",
    phaseCount: 2,
    waves: [
      {
        wave: 1,
        synthesisQuestion: "What is the crypto primitive and its weakness?",
        streams: [
          {
            id: `${tag}-w1-params`,
            name: "Parameter Analysis",
            description: "Parse and classify all cryptographic parameters, identify primitive type",
            skills: ["ctf-crypto"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "quick",
            agentPrompt: `Analyze the crypto challenge at ${input.target}. Classify the primitive (RSA/ECC/AES/stream/PRNG/hash/classical), normalize all parameters, identify the security assumption.`,
            outputContract: "{ primitive, parameters, securityAssumption, weaknessCandidates }",
            killCondition: "Primitive classified and parameters normalized",
          },
          {
            id: `${tag}-w1-weakness`,
            name: "Weakness Scan",
            description: "Check common CTF crypto weaknesses systematically",
            skills: ["ctf-crypto"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "medium",
            agentPrompt: `Systematically check all common weaknesses for this crypto challenge: small exponents, shared primes, nonce reuse, weak PRNG, padding oracle, etc. Use the ctf-crypto decision tree.`,
            outputContract: "JSON array of { weakness, checkResult, confidence, exploitPath }",
            killCondition: "All common weaknesses checked, top candidate identified",
          },
        ],
      },
      {
        wave: 2,
        synthesisQuestion: "Can we recover the key/plaintext/flag?",
        streams: [
          {
            id: `${tag}-w2-solve`,
            name: "Solver Construction",
            description: "Build the mathematical solver and recover the flag",
            skills: ["ctf-crypto"],
            canRunParallel: false,
            dependsOn: [`${tag}-w1-params`, `${tag}-w1-weakness`],
            estimatedDuration: "medium",
            agentPrompt:
              "Build the solver based on confirmed weakness. Use Python with Sage if needed for lattice/algebra. Write solve.py. Verify plaintext/key and capture flag.",
            outputContract: "solve.py + flag string",
            killCondition: "Flag recovered or attack proven impossible",
          },
        ],
      },
    ],
    strategySummary: `2-wave crypto solve. Wave 1: concurrent parameter analysis + weakness scan. Wave 2: solver construction.`,
    riskBudget: { requests: 10, concurrency: 2 },
  }
}

function revDecomposition(tag: string, input: ChallengeInput): Decomposition {
  return {
    challengeTag: tag,
    category: "rev",
    phaseCount: 3,
    waves: [
      {
        wave: 1,
        synthesisQuestion: "What kind of checker/VM/obfuscation are we dealing with?",
        streams: [
          {
            id: `${tag}-w1-static`,
            name: "Static Analysis",
            description: "Decompilation, constant extraction, algorithm identification",
            skills: ["ctf-rev"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "medium",
            agentPrompt: `Perform static analysis on ${input.binary || input.target}. Decompile, extract constants, identify checker logic, trace the validation path. Load ctf-rev skill references as needed.`,
            outputContract: "{ checkerType, constants, algorithm, antiDebug, complexity }",
            killCondition: "Checker logic understood or complexity classified",
          },
          {
            id: `${tag}-w1-dynamic`,
            name: "Dynamic Analysis",
            description: "Runtime tracing, debugger, input/output analysis",
            skills: ["ctf-rev"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "medium",
            agentPrompt: `Analyze ${input.binary || input.target} dynamically. Trace execution, observe input/output behavior, identify success/failure paths. Use strace/gdb/ltrace as appropriate.`,
            outputContract: "{ observedBehavior, successCondition, failureCondition, runtimeHints }",
            killCondition: "Runtime behavior documented and matches static analysis",
          },
        ],
      },
      {
        wave: 2,
        synthesisQuestion: "Can we extract the flag via symbolic execution, emulation, or direct inversion?",
        streams: [
          {
            id: `${tag}-w2-symbolic`,
            name: "Symbolic Execution / Constraint Solving",
            description: "Use angr/z3 to solve checker constraints",
            skills: ["ctf-rev > z3-constraint-solver", "ctf-rev > angr-symbolic-exec"],
            canRunParallel: true,
            dependsOn: [`${tag}-w1-static`, `${tag}-w1-dynamic`],
            estimatedDuration: "long",
            agentPrompt: `Apply symbolic execution (angr) or constraint solving (z3) to the checker logic. Extract the flag or input that passes validation.`,
            outputContract: "{ method, result, flag, timeRequired }",
            killCondition: "Flag extracted or method proven infeasible",
          },
          {
            id: `${tag}-w2-invert`,
            name: "Algorithm Inversion",
            description: "Reverse the encoding/transformation/check algorithm manually",
            skills: ["ctf-rev"],
            canRunParallel: true,
            dependsOn: [`${tag}-w1-static`, `${tag}-w1-dynamic`],
            estimatedDuration: "medium",
            agentPrompt: `Invert the checker algorithm manually. XOR, ADD, TEA, AES, custom transforms — reverse each step to recover the expected input/flag.`,
            outputContract: "{ invertedFlag, steps, verified }",
            killCondition: "Flag recovered or algorithm too complex — defer to symbolic execution",
          },
        ],
      },
      {
        wave: 3,
        synthesisQuestion: "Flag verified against original binary?",
        streams: [
          {
            id: `${tag}-w3-verify`,
            name: "Verification & Solve Script",
            description: "Verify the flag against the original binary, write solve.py",
            skills: ["ctf-rev"],
            canRunParallel: false,
            dependsOn: [`${tag}-w2-symbolic`, `${tag}-w2-invert`],
            estimatedDuration: "quick",
            agentPrompt:
              "Verify the extracted flag against the original binary. Write solve.py with the deterministic extraction. Write flag to agent_flag.txt.",
            outputContract: "solve.py + flag string",
            killCondition: "Flag verified against binary",
          },
        ],
      },
    ],
    strategySummary: `3-wave rev solve. Wave 1: concurrent static+dynamic analysis. Wave 2: concurrent symbolic+inversion. Wave 3: verification.`,
    riskBudget: { requests: 15, concurrency: 2 },
  }
}

function forensicsDecomposition(tag: string, input: ChallengeInput): Decomposition {
  return {
    challengeTag: tag,
    category: "forensics",
    phaseCount: 2,
    waves: [
      {
        wave: 1,
        synthesisQuestion: "What type of forensics artifact? Where is the hidden data?",
        streams: [
          {
            id: `${tag}-w1-inventory`,
            name: "Artifact Inventory",
            description: "File type identification, magic bytes, strings, binwalk",
            skills: ["ctf-stego-probe"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "quick",
            agentPrompt: `Inventory ${input.target}. Run file type detection, strings analysis, binwalk, and magic byte verification. Catalog all embedded files and suspicious regions.`,
            outputContract: "{ fileTypes, embeddedFiles, suspiciousRegions, stringHighlights }",
            killCondition: "All artifacts cataloged, top 3 suspicious regions identified",
          },
          {
            id: `${tag}-w1-stego`,
            name: "Stego Detection",
            description: "LSB, metadata, frequency analysis, hidden channel detection",
            skills: ["ctf-stego-probe"],
            canRunParallel: true,
            dependsOn: [],
            estimatedDuration: "medium",
            agentPrompt: `Check ${input.target} for steganographic content. LSB in images, audio spectrogram, metadata, trailing data, EXIF, color palette anomalies.`,
            outputContract: "JSON array of { technique, found, location, extractionMethod }",
            killCondition: "All stego techniques checked, positive hit or all negative",
          },
        ],
      },
      {
        wave: 2,
        synthesisQuestion: "Can we extract the flag?",
        streams: [
          {
            id: `${tag}-w2-extract`,
            name: "Deep Extraction",
            description: "Carving, extraction, decoding the hidden data",
            skills: [],
            canRunParallel: false,
            dependsOn: [`${tag}-w1-inventory`, `${tag}-w1-stego`],
            estimatedDuration: "medium",
            agentPrompt:
              "Extract the hidden data from the confirmed location. Write solve.py that reproduces the extraction. Capture flag and write to agent_flag.txt.",
            outputContract: "solve.py + flag string",
            killCondition: "Flag extracted or extraction proven impossible",
          },
        ],
      },
    ],
    strategySummary: `2-wave forensics extraction. Wave 1: concurrent inventory+stego detection. Wave 2: deep extraction.`,
    riskBudget: { requests: 10, concurrency: 2 },
  }
}

function genericDecomposition(tag: string, input: ChallengeInput): Decomposition {
  return {
    challengeTag: tag,
    category: input.category || "misc",
    phaseCount: 2,
    waves: [
      {
        wave: 1,
        synthesisQuestion: "What kind of challenge is this? Which category skill applies?",
        streams: [
          {
            id: `${tag}-w1-classify`,
            name: "Challenge Classification",
            description: "Determine the actual challenge type and dispatch to the correct skill",
            skills: ["ctf-misc"],
            canRunParallel: false,
            dependsOn: [],
            estimatedDuration: "quick",
            agentPrompt: `Classify this challenge: ${input.description || input.target}. Determine if it's web/pwn/crypto/rev/forensics/misc/osint/blockchain based on files, description, and behavior.`,
            outputContract: "{ classification, confidence, evidence, recommendedSkill }",
            killCondition: "Challenge classified with high confidence",
          },
        ],
      },
      {
        wave: 2,
        synthesisQuestion: "Can we solve this now that we know the category?",
        streams: [
          {
            id: `${tag}-w2-solve`,
            name: "Category-Specific Solve",
            description: "Solve using the appropriate category skill",
            skills: ["ctf-misc"],
            canRunParallel: false,
            dependsOn: [`${tag}-w1-classify`],
            estimatedDuration: "medium",
            agentPrompt: "Now that the challenge is classified, apply the appropriate skill to solve it.",
            outputContract: "solve script + flag string",
            killCondition: "Flag captured or proven impossible",
          },
        ],
      },
    ],
    strategySummary: `2-wave generic approach. Wave 1: classification. Wave 2: category-specific solve.`,
    riskBudget: { requests: 20, concurrency: 1 },
  }
}

export default tool({
  description:
    "CTF challenge decomposition: analyze a challenge and produce a structured, parallel-ready work breakdown for team-mode solving.",
  args: {
    category: tool.schema
      .string()
      .describe("Challenge category: web | pwn | crypto | rev | forensics | misc | osint | blockchain"),
    target: tool.schema.string().describe("Target URL, binary path, file path, or connection string"),
    sourcePath: tool.schema.string().optional().describe("Path to source code (if available)"),
    description: tool.schema.string().optional().describe("Challenge description, hints, or any additional context"),
    dockerfile: tool.schema.string().optional().describe("Path to Dockerfile (if available)"),
    binary: tool.schema.string().optional().describe("Path to binary (for pwn/rev challenges)"),
    libc: tool.schema.string().optional().describe("Path to libc (for pwn challenges)"),
  },
  async execute(args) {
    const { category, target, sourcePath, description, dockerfile, binary, libc } = args

    if (!category || !target) {
      return "ERROR: 'category' and 'target' are required.\nUsage: ctf-decompose-task category=web target=<url> [sourcePath=...] [description=...]"
    }

    const input: ChallengeInput = {
      category,
      target,
      sourcePath,
      description,
      dockerfile,
      binary,
      libc,
    }

    try {
      const plan = classifyDecomposition(input)
      return JSON.stringify(plan, null, 2)
    } catch (err) {
      return `ERROR: decomposition failed — ${err instanceof Error ? err.message : String(err)}`
    }
  },
})
