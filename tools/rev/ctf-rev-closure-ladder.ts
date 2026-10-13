import { tool } from "@opencode-ai/plugin"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { directoryFromContext, resolveInsideWorkspace, workspaceRootFromContext } from "../lib/workspace-path.ts"
import decisionState from "../core/ctf-decision-state.ts"
import { access as fileAccess } from "node:fs/promises"
import { recordRuntimeArtifact, updateRuntimeSession } from "../lib/rev-runtime-session-store.ts"

// REV closure ladder, parallel to ctf-pwn-closure-router / ctf-pwn-closure-promote.
// Input: confirmed primitive / checker boundary / runtime state.
// Output: REV-specific closure ladder + ranked candidates + falsify conditions.

type ClosureCandidate = {
  rank: number
  family: string
  description: string
  prerequisites: string[]
  confirmOracle: string
  falsifyCondition: string
  estimatedCost: "low" | "medium" | "high"
  stateIndependence: "high" | "medium" | "low"
  recommendedTool: string
}

const REV_CLOSURE_LADDER: ClosureCandidate[] = [
  {
    rank: 1,
    family: "flag_candidate_plaintext",
    description: "Flag or plaintext already visible in strings/memory/decrypted output. Verify once and stop.",
    prerequisites: [
      "flag-like string found in binary/pcap/memory dump",
      "no obfuscation layer between storage and output",
    ],
    confirmOracle: "string matches expected flag format and is accepted by binary/remote",
    falsifyCondition: "string is decoy/placeholder/sample; binary rejects it",
    estimatedCost: "low",
    stateIndependence: "high",
    recommendedTool: "ctf-flag-grep + manual verify",
  },
  {
    rank: 2,
    family: "checker_extraction",
    description: "Extract checker logic (constants, tables, transform) into solve.py. Invert or solve constraints.",
    prerequisites: ["checker function identified", "constants/tables extracted", "transform direction known"],
    confirmOracle: "solve.py output accepted by binary",
    falsifyCondition: "solve.py output rejected; checker semantics wrong (signedness/width/endianness)",
    estimatedCost: "low",
    stateIndependence: "high",
    recommendedTool: "ctf-elf-slice / ctf-rev-pe-slice + solve.py",
  },
  {
    rank: 3,
    family: "runtime_dump",
    description: "Dump post-unpack/post-decrypt payload from live memory. Continue rev on dumped code.",
    prerequisites: ["packed/self-decrypting binary", "stable stdout marker identified", "dump address range known"],
    confirmOracle: "dumped bytes are valid code (correct opcode patterns) or valid data (printable/structured)",
    falsifyCondition: "dumped bytes still high-entropy; marker too early or wrong address",
    estimatedCost: "medium",
    stateIndependence: "medium",
    recommendedTool: "ctf-rev-live-memory-dump",
  },
  {
    rank: 4,
    family: "unicorn_qiling_replay",
    description: "Recover arch/mode/map/register/start/end from emulation API calls. Replay checker in isolation.",
    prerequisites: [
      "Unicorn/Qiling/Capstone API signals detected",
      "arch/mode inferred",
      "payload bytes available (from dump or embedded)",
    ],
    confirmOracle: "replay output matches native behavior for 1-2 known test inputs",
    falsifyCondition: "replay diverges from native; missing register state or memory mapping",
    estimatedCost: "medium",
    stateIndependence: "high",
    recommendedTool: "ctf-rev-unicorn-helper + ctf-rev-unicorn-replay-builder",
  },
  {
    rank: 5,
    family: "simple_transform_inversion",
    description: "XOR/add/rol/table/base64/custom encoder. Invert per-byte or via inverse table.",
    prerequisites: ["transform identified", "key/table/constants extracted", "transform direction known"],
    confirmOracle: "inverted output is printable and matches flag format",
    falsifyCondition: "inverted output non-printable; wrong key, wrong direction, or non-invertible transform",
    estimatedCost: "low",
    stateIndependence: "high",
    recommendedTool: "solve.py with extracted constants",
  },
  {
    rank: 6,
    family: "z3_constraints",
    description: "Encode checker as bit-vector constraints. Solve with z3.",
    prerequisites: [
      "constraints collected from branch conditions",
      "input length and domain known",
      "width/signedness verified",
    ],
    confirmOracle: "z3 model accepted by binary",
    falsifyCondition: "z3 unsat or model rejected; constraint encoding wrong (width/signedness/truncation)",
    estimatedCost: "medium",
    stateIndependence: "high",
    recommendedTool: "python3 z3-solver in revlab container",
  },
  {
    rank: 7,
    family: "angr_symbolic",
    description: "Symbolic execution with find/avoid addresses. Bounded input.",
    prerequisites: [
      "success/failure addresses known",
      "input channel and max length known",
      "no severe anti-symbolic on checker path",
    ],
    confirmOracle: "angr model accepted by binary",
    falsifyCondition: "path explosion; no model found; anti-symbolic behavior blocks exploration",
    estimatedCost: "high",
    stateIndependence: "high",
    recommendedTool: "python3 angr in revlab container",
  },
  {
    rank: 8,
    family: "vm_lifter",
    description: "Lift VM dispatcher/opcode handlers to Python. Emulate or emit z3 constraints per instruction.",
    prerequisites: [
      "dispatcher loop identified",
      "opcode table mapped",
      "bytecode blob located",
      "3-5 high-frequency handlers labeled",
    ],
    confirmOracle: "lifted VM execution matches native trace for controlled input",
    falsifyCondition: "handler semantics wrong; opcode mapping incomplete; state layout incorrect",
    estimatedCost: "high",
    stateIndependence: "medium",
    recommendedTool: "custom disassembler + python3 emulator",
  },
  {
    rank: 9,
    family: "patch_bypass",
    description: "Patch binary to bypass checker. Verification or last resort, not primary solve.",
    prerequisites: ["checker address known", "patch does not alter flag computation", "verification oracle exists"],
    confirmOracle: "patched binary outputs flag or accepts any input",
    falsifyCondition: "patch changes semantics; flag is computed from input, not stored",
    estimatedCost: "low",
    stateIndependence: "high",
    recommendedTool: "pwntools patch",
  },
]

function rankCandidates(evidence: {
  primitive?: string
  checkerBoundary?: string
  runtimeState?: string
  hasFlagString?: boolean
  hasChecker?: boolean
  isPacked?: boolean
  hasUnicornSignals?: boolean
  hasTransform?: boolean
  hasZ3Constraints?: boolean
  hasAngrFeasible?: boolean
  hasVMDetected?: boolean
}): ClosureCandidate[] {
  const alive: ClosureCandidate[] = []

  // Rank 1: direct flag
  if (evidence.hasFlagString) alive.push(REV_CLOSURE_LADDER[0])

  // Rank 2: checker extraction
  if (evidence.hasChecker) alive.push(REV_CLOSURE_LADDER[1])

  // Rank 3: runtime dump
  if (evidence.isPacked) alive.push(REV_CLOSURE_LADDER[2])

  // Rank 4: unicorn replay
  if (evidence.hasUnicornSignals) alive.push(REV_CLOSURE_LADDER[3])

  // Rank 5: simple transform
  if (evidence.hasTransform) alive.push(REV_CLOSURE_LADDER[4])

  // Rank 6: z3
  if (evidence.hasZ3Constraints) alive.push(REV_CLOSURE_LADDER[5])

  // Rank 7: angr
  if (evidence.hasAngrFeasible) alive.push(REV_CLOSURE_LADDER[6])

  // Rank 8: VM lifter
  if (evidence.hasVMDetected) alive.push(REV_CLOSURE_LADDER[7])

  // Rank 9: patch (always available as last resort)
  if (evidence.hasChecker) alive.push(REV_CLOSURE_LADDER[8])

  return alive.sort((a, b) => a.rank - b.rank)
}

export default tool({
  description:
    "CTF REV closure ladder: rank REV-specific closure candidates (direct flag, checker extraction, runtime dump, unicorn replay, transform inversion, z3, angr, VM lifter, patch bypass) from confirmed primitive/checker/runtime evidence. Emits falsify conditions and recommended tools, parallel to ctf-pwn-closure-router.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Compact evidence summary: primitive, checker boundary, runtime state, signals (flag string / checker / packed / unicorn / transform / z3 / angr / VM). Free text; tool will parse keywords.",
      ),
    primitive: tool.schema
      .string()
      .optional()
      .describe("Confirmed or suspected primitive, e.g. 'checker at 0x401234 with XOR table at 0x405060'."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output dir for closure plan. Default work/rev-closure-ladder."),
    ledgerPath: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative Rev closure ledger markdown path. Defaults beside closure-plan.json."),
    decisionStatePath: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative decision-state JSON path. Existing state is synchronized automatically."),
    sessionPath: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative rev_runtime_session.v1 JSON; closure plan and ledger are linked as evidence."),
    syncState: tool.schema
      .boolean()
      .optional()
      .describe("Synchronize closure probes into decision state when a state file exists. Default true."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const text = `${args.evidence} ${args.primitive || ""}`.toLowerCase()

    const parsed = {
      primitive: args.primitive || "",
      checkerBoundary: /checker|compare|verify|validate|check_/.test(text) ? text : "",
      runtimeState: /runtime|docker|container|wsl|emulator/.test(text) ? text : "",
      hasFlagString: /flag\{|ctf\{|flag_like|plaintext|direct_flag/.test(text),
      hasChecker: /checker|compare|strcmp|memcmp|verify|validate|check_/.test(text),
      isPacked: /packed|upx|self.?decrypt|self.?modif|high.?entropy|unpack/.test(text),
      hasUnicornSignals: /unicorn|qiling|uc_open|uc_mem_map|uc_emu_start|capstone|emulat/.test(text),
      hasTransform: /xor|add|sub|rol|ror|table|sbox|base64|encode|decode|transform/.test(text),
      hasZ3Constraints: /z3|constraint|bitvector|sat|solver/.test(text),
      hasAngrFeasible: /angr|symbolic|find.?avoid|path.?explosion/.test(text),
      hasVMDetected: /vm|dispatch|opcode|bytecode|handler.?table|instruction.?pointer/.test(text),
    }

    const candidates = rankCandidates(parsed)
    const topCandidate = candidates[0] || null
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const outDir = resolveInsideWorkspace(workspace, args.outDir || "work/rev-closure-ladder")
    await mkdir(outDir, { recursive: true })

    const plan = {
      schema_version: "rev_closure_ladder.v1",
      verdict: "closure_candidates",
      direct_solve: "no",
      candidate_status: candidates.length ? "pending_oracle" : "none",
      oracle_verified: false,
      evidence_summary: args.evidence,
      primitive: args.primitive || "unspecified",
      parsed_signals: parsed,
      candidates_ranked: candidates.length,
      top_candidate: topCandidate,
      all_candidates: candidates,
      promotion_rule:
        "A higher-rank candidate may be promoted only when the lower-rank candidate is falsified by a real oracle, the higher-rank is provably cheaper, or strong evidence already exists.",
      recommended_next: [] as string[],
      ledger_path: "",
      decision_state_sync: null as unknown,
    }

    if (topCandidate) {
      plan.recommended_next.push(`TOP: rank#${topCandidate.rank} ${topCandidate.family} - ${topCandidate.description}`)
      plan.recommended_next.push(`confirm oracle: ${topCandidate.confirmOracle}`)
      plan.recommended_next.push(`falsify condition: ${topCandidate.falsifyCondition}`)
      plan.recommended_next.push(`recommended tool: ${topCandidate.recommendedTool}`)
    }
    if (candidates.length > 1) {
      plan.recommended_next.push(
        `NEXT fallback: rank#${candidates[1].rank} ${candidates[1].family} if top is falsified`,
      )
    }
    if (candidates.length === 0) {
      plan.recommended_next.push(
        "no closure candidate matched; run ctf-binary-probe / ctf-elf-slice / ctf-rev-pe-slice to gather more signals",
      )
    }

    const planPath = path.join(outDir, "closure-plan.json")
    const ledgerPath = resolveInsideWorkspace(
      workspace,
      args.ledgerPath || path.relative(workspace, path.join(outDir, "rev-closure-ledger.md")),
    )
    const ledgerEntry = [
      `## Closure ladder run ? ${new Date().toISOString()}`,
      "",
      `- **primitive**: ${plan.primitive}`,
      `- **evidence**: ${args.evidence.slice(0, 1200)}`,
      `- **top candidate**: ${topCandidate ? `${topCandidate.family} (rank ${topCandidate.rank})` : "none"}`,
      `- **plan**: ${path.relative(directory, planPath).replace(/\\/g, "/")}`,
      "",
      "| Rank | Family | Status | Confirm oracle | Falsifier | Tool |",
      "| ---: | --- | --- | --- | --- | --- |",
      ...(candidates.length
        ? candidates.map(
            (candidate) =>
              `| ${candidate.rank} | ${candidate.family} | candidate | ${candidate.confirmOracle} | ${candidate.falsifyCondition} | ${candidate.recommendedTool} |`,
          )
        : ["| ? | none | blocked | Gather artifact/checker evidence first | ? | ctf-rev-analyze |"]),
      "",
      "Promotion rule: do not promote a route without a real oracle or a recorded falsifier for the cheaper route.",
      "",
    ].join("\n")
    let previousLedger = ""
    try {
      previousLedger = await readFile(ledgerPath, "utf8")
    } catch {
      previousLedger = "# Rev Closure Ledger\n\n> Auto-maintained by `ctf-rev-closure-ladder`.\n\n"
    }
    await writeFile(ledgerPath, `${previousLedger.trimEnd()}\n\n${ledgerEntry}`, "utf8")

    const shouldSyncState = args.syncState !== false
    let stateSync: { attempted: boolean; synced: boolean; path?: string; detail?: string } = {
      attempted: false,
      synced: false,
    }
    const candidateStatePath = args.decisionStatePath
      ? resolveInsideWorkspace(workspace, args.decisionStatePath)
      : resolveInsideWorkspace(workspace, ".ctf-decision-state.json")
    let stateExists = false
    try {
      await access(candidateStatePath)
      stateExists = true
    } catch {
      stateExists = Boolean(args.decisionStatePath)
    }
    if (shouldSyncState && stateExists) {
      stateSync = {
        attempted: true,
        synced: false,
        path: path.relative(directory, candidateStatePath).replace(/\\/g, "/"),
      }
      try {
        await decisionState.execute(
          {
            operation: "add_closure_probe",
            statePath: path.relative(workspace, candidateStatePath).replace(/\\/g, "/"),
            actionJson: JSON.stringify({
              source: "ctf-rev-closure-ladder",
              primitive: plan.primitive,
              evidence: args.evidence.slice(0, 2000),
              planPath: path.relative(directory, planPath).replace(/\\/g, "/"),
              ledgerPath: path.relative(directory, ledgerPath).replace(/\\/g, "/"),
              topCandidate: topCandidate?.family ?? null,
              probes: candidates.map((candidate) => ({
                rank: candidate.rank,
                family: candidate.family,
                confirm: candidate.confirmOracle,
                falsify: candidate.falsifyCondition,
                recommendedTool: candidate.recommendedTool,
              })),
            }),
          },
          { directory, worktree: workspace } as never,
        )
        stateSync.synced = true
        stateSync.detail = "closure probes appended"
      } catch (error) {
        stateSync.detail = error instanceof Error ? error.message : String(error)
      }
    } else {
      stateSync.detail = "no existing decision state; pass decisionStatePath to create/sync one"
    }

    if (args.sessionPath) {
      const sessionFile = resolveInsideWorkspace(workspace, args.sessionPath)
      if (!(await fileAccess(sessionFile).then(() => true).catch(() => false))) {
        throw new Error(`runtime session not found: ${path.relative(workspace, sessionFile).replace(/\\/g, "/")}`)
      }
      if (await fileAccess(sessionFile).then(() => true).catch(() => false)) {
        await recordRuntimeArtifact(sessionFile, workspace, {
          path: path.relative(workspace, planPath).replace(/\\/g, "/"),
          kind: "closure-plan",
          source: "ctf-rev-closure-ladder",
          status: "generated",
          notes: `top_candidate=${topCandidate?.family ?? "none"}`,
        })
        await recordRuntimeArtifact(sessionFile, workspace, {
          path: path.relative(workspace, ledgerPath).replace(/\\/g, "/"),
          kind: "closure-ledger",
          source: "ctf-rev-closure-ladder",
          status: "generated",
        })
        await updateRuntimeSession(sessionFile, workspace, "link_closure", {
          summary: "Rev closure plan linked to runtime session",
          evidence_refs: [path.relative(workspace, planPath).replace(/\\/g, "/"), path.relative(workspace, ledgerPath).replace(/\\/g, "/")],
          next_action: plan.recommended_next,
        })
      }
    }
    plan.ledger_path = path.relative(directory, ledgerPath).replace(/\\/g, "/")
    plan.decision_state_sync = stateSync
    await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8")

    if (args.jsonOnly) return JSON.stringify(plan, null, 2)
    return [
      "rev_closure_ladder:",
      `- schema_version: ${plan.schema_version}`,
      `- verdict: ${plan.verdict}`,
      `- direct_solve: ${plan.direct_solve}`,
      `- candidate_status: ${plan.candidate_status}`,
      `- oracle_verified: ${plan.oracle_verified}`,
      `- evidence_summary: ${args.evidence.slice(0, 200)}`,
      `- primitive: ${plan.primitive}`,
      "parsed_signals:",
      ...Object.entries(parsed)
        .filter(([, v]) => v)
        .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v.slice(0, 100) : v}`),
      `- candidates_ranked: ${candidates.length}`,
      topCandidate ? `- top_candidate: rank#${topCandidate.rank} ${topCandidate.family}` : "- top_candidate: none",
      "",
      "candidates (ranked):",
      ...(candidates.length
        ? candidates.map(
            (c) =>
              `- rank#${c.rank} ${c.family} (cost=${c.estimatedCost}, state_indep=${c.stateIndependence})\n  desc: ${c.description}\n  confirm: ${c.confirmOracle}\n  falsify: ${c.falsifyCondition}\n  tool: ${c.recommendedTool}`,
          )
        : ["- none"]),
      "",
      "promotion_rule:",
      `  ${plan.promotion_rule}`,
      "",
      "recommended_next:",
      ...plan.recommended_next.map((x) => `- ${x}`),
      "",
      `closure_plan_path: ${path.relative(directory, planPath).replace(/\\/g, "/")}`,
    ].join("\n")
  },
})
