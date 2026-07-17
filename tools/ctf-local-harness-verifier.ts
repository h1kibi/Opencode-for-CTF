import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile, stat } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

type AnyRecord = Record<string, unknown>

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`path must stay inside the current workspace: ${input}`)
  return target
}

function jsonArg<T>(value: string | undefined, fallback: T): T {
  if (!value || !value.trim()) return fallback
  return JSON.parse(value) as T
}

function firstString(...values: unknown[]) {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim()
  return ""
}

function normalizeFamily(finding: AnyRecord) {
  return (
    firstString(finding.vulnerability_type, finding.family, finding.type, finding.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_") || "unknown"
  )
}

function payloadFamilies(family: string) {
  if (/sql|hql|mybatis/.test(family))
    return ["quote/error", "boolean tautology", "union shape", "stacked/comment", "parser differential"]
  if (/command|rce|code/.test(family))
    return ["separator ;", "pipe |", "and/or && ||", "substitution $()", "backticks", "argument injection"]
  if (/path|file|lfi|traversal/.test(family))
    return [
      "../ traversal",
      "absolute path",
      "encoded traversal",
      "double decode",
      "separator normalization",
      "base-dir escape",
    ]
  if (/ssrf|url/.test(family))
    return ["localhost", "127.0.0.1", "IPv6 loopback", "metadata IP", "redirect", "scheme confusion"]
  if (/xss|template|ssti|spel|el/.test(family))
    return ["raw tag", "attribute/event", "template arithmetic", "expression evaluation", "encoding differential"]
  if (/deser|pickle|yaml|xml|xxe/.test(family))
    return ["magic/header", "external entity", "type gadget", "parser feature", "class allowlist bypass"]
  if (/auth|idor|access|role/.test(family))
    return ["owner/non-owner", "missing role", "mass assignment", "forced id", "workflow skip"]
  return ["benign control", "malformed input", "boundary input", "known-bad pattern", "differential oracle"]
}

function successOracle(family: string) {
  if (/sql|hql|mybatis/.test(family))
    return "mock DB captures unparameterized query or attacker-controlled SQL structure"
  if (/command|rce|code/.test(family))
    return "mock command/code sink captures attacker-controlled command or expression without executing it"
  if (/path|file|lfi|traversal/.test(family))
    return "normalized path escapes intended base directory or reaches sensitive target"
  if (/ssrf|url/.test(family)) return "mock HTTP client captures internal/forbidden URL destination"
  if (/xss|template|ssti|spel|el/.test(family))
    return "renderer output contains unescaped payload or expression evaluation marker"
  if (/deser|pickle|yaml|xml|xxe/.test(family))
    return "parser/deserializer mock observes dangerous type/entity/gadget path"
  if (/auth|idor|access|role/.test(family))
    return "authorization decision allows non-owner/low-role access to protected object or state change"
  return "observable differential matches the vulnerability hypothesis"
}

function chainImplication(family: string) {
  if (/command|rce|code|deser|ssti|spel|el/.test(family)) return "rce"
  if (/path|file|lfi|xxe/.test(family)) return "file-read"
  if (/upload|write/.test(family)) return "file-write"
  if (/ssrf/.test(family)) return "ssrf"
  if (/auth|idor|access|role/.test(family)) return "auth-bypass"
  if (/secret|credential/.test(family)) return "secret-leak"
  return "none"
}

function planFor(finding: AnyRecord, languageArg?: string) {
  const family = normalizeFamily(finding)
  const target = {
    file: firstString(finding.file, finding.file_path, finding.path),
    symbol: firstString(finding.symbol, finding.function, finding.method, finding.handler),
    line: finding.line ?? finding.line_start ?? 0,
    language: firstString(languageArg, finding.language, "python"),
  }
  return {
    finding_id: firstString(finding.id, finding.title, family),
    target,
    vulnerability_type: family,
    source: firstString(finding.source, finding.controlled_input, finding.controllability),
    sink: firstString(finding.sink, finding.api, finding.sink_or_condition),
    mock_plan: [
      "extract the smallest handler/function/class around target sink",
      "replace DB/HTTP/filesystem/command/template/auth dependencies with recording mocks",
      "feed benign control and multiple malicious payload families",
      "assert on captured sink arguments instead of executing dangerous side effects",
    ],
    payload_families: payloadFamilies(family),
    success_oracle: successOracle(family),
    verdict: "planned",
    chain_implication: chainImplication(family),
  }
}

function pythonSkeleton(plan: AnyRecord) {
  const payloads = JSON.stringify(plan.payload_families ?? [], null, 2)
  return `# Auto-generated CTF local harness skeleton. Replace target_function with extracted code.
captured = []

def record_sink(kind, value):
    print(f"[DETECTED] {kind}: {value}")
    captured.append((kind, str(value)))

def target_function(user_input):
    # TODO: paste minimal vulnerable function/class logic here.
    # Replace real side effects with record_sink(...).
    record_sink("sink", user_input)

payloads = ${payloads}
print("=== CTF Local Harness Start ===")
for family in payloads:
    sample = f"PAYLOAD::{family}"
    print(f"[TEST] {family} -> {sample}")
    target_function(sample)

print("=== Oracle ===")
print(${JSON.stringify(String(plan.success_oracle ?? ""))})
print("[CONFIRMED] review captured sink arguments above if attacker-controlled payload reaches sink")
`
}

function jsSkeleton(plan: AnyRecord) {
  const payloads = JSON.stringify(plan.payload_families ?? [], null, 2)
  return [
    "// Auto-generated CTF local harness skeleton. Replace targetFunction with extracted code.",
    "const captured = []",
    "function recordSink(kind, value) {",
    "  console.log('[DETECTED] ' + kind + ': ' + value)",
    "  captured.push([kind, String(value)])",
    "}",
    "function targetFunction(userInput) {",
    "  // TODO: paste minimal vulnerable logic here. Replace real side effects with recordSink(...).",
    '  recordSink("sink", userInput)',
    "}",
    `const payloads = ${payloads}`,
    'console.log("=== CTF Local Harness Start ===")',
    "for (const family of payloads) {",
    "  const sample = 'PAYLOAD::' + family",
    "  console.log('[TEST] ' + family + ' -> ' + sample)",
    "  targetFunction(sample)",
    "}",
    'console.log("=== Oracle ===")',
    `console.log(${JSON.stringify(String(plan.success_oracle ?? ""))})`,
    'console.log("[CONFIRMED] review captured sink arguments above if attacker-controlled payload reaches sink")',
    "",
  ].join("\n")
}

function genericSkeleton(plan: AnyRecord) {
  return `# CTF local harness plan\n# Target: ${JSON.stringify(plan.target)}\n# Mock plan: ${JSON.stringify(plan.mock_plan)}\n# Payload families: ${JSON.stringify(plan.payload_families)}\n# Success oracle: ${String(plan.success_oracle ?? "")}\n# Fill this skeleton manually for the target language.\n`
}

function skeletonFor(plan: AnyRecord, language: string) {
  const lang = language.toLowerCase()
  if (lang === "python" || lang === "py") return pythonSkeleton(plan)
  if (["javascript", "js", "node", "typescript", "ts"].includes(lang)) return jsSkeleton(plan)
  return genericSkeleton(plan)
}

const dangerousPatterns = [
  /\brm\s+-rf\b/i,
  /\bRemove-Item\b/i,
  /\bunlink\s*\(/i,
  /\brmdir\s*\(/i,
  /\bdel\s+\/f\b/i,
  /\bcurl\b|\bwget\b|\bfetch\s*\(|\brequests\.|\bhttp\.request\b|\bsocket\b/i,
  /\bos\.system\s*\(|\bsubprocess\.|\bchild_process\.|\bexec\s*\(|\bshell_exec\s*\(/i,
]

function safetyScan(code: string, allowDangerous: boolean) {
  const hits = dangerousPatterns.filter((re) => re.test(code)).map((re) => String(re))
  return { ok: allowDangerous || hits.length === 0, hits }
}

function extFor(language: string) {
  const lang = language.toLowerCase()
  if (lang === "python" || lang === "py") return ".py"
  if (["javascript", "js", "node", "typescript", "ts"].includes(lang)) return ".js"
  if (lang === "php") return ".php"
  if (lang === "ruby") return ".rb"
  return ".txt"
}

function runnerFor(language: string) {
  const lang = language.toLowerCase()
  if (lang === "python" || lang === "py") return { cmd: "python", args: [] as string[] }
  if (["javascript", "js", "node", "typescript", "ts"].includes(lang)) return { cmd: "node", args: [] as string[] }
  if (lang === "php") return { cmd: "php", args: [] as string[] }
  if (lang === "ruby") return { cmd: "ruby", args: [] as string[] }
  return null
}

function evaluateOutput(output: string, plan: AnyRecord) {
  const confirmed =
    /\[(CONFIRMED|VULN|DETECTED)\]|unparameterized|escaped|bypass|executed|internal url|role bypass/i.test(output)
  const likely = /\[TEST\]|captured|oracle|payload/i.test(output)
  return {
    verdict: confirmed ? "confirmed" : likely ? "likely" : "uncertain",
    observed_signal: output.slice(0, 2000),
    chain_implication: String(plan.chain_implication ?? "none"),
  }
}

export default tool({
  description:
    "CTF local harness verifier: plan, write, safely run, and evaluate local mock-based verification harnesses for source-derived findings. Defaults to non-execution; execution requires allowRun=true.",
  args: {
    operation: tool.schema.string().describe("plan | write | run | evaluate"),
    findingJson: tool.schema
      .string()
      .optional()
      .describe("JSON finding with vulnerability_type, file/file_path, symbol/function, source, sink, language"),
    harnessJson: tool.schema
      .string()
      .optional()
      .describe("Existing harness plan JSON. If omitted, generated from findingJson."),
    code: tool.schema
      .string()
      .optional()
      .describe("Harness code to write/run. If omitted, a safe skeleton is generated for plan/write."),
    language: tool.schema
      .string()
      .optional()
      .describe(
        "python | javascript | php | ruby. Execution is supported for these languages only. Default from finding or python.",
      ),
    harnessFile: tool.schema.string().optional().describe("Workspace-relative harness file path for run/evaluate."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory for generated harnesses. Default work/ctf-harness"),
    allowRun: tool.schema.boolean().optional().describe("Required true for executing a harness. Default false."),
    allowDangerous: tool.schema
      .boolean()
      .optional()
      .describe("Allow code containing network/process/destructive patterns. Default false; strongly discouraged."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in ms. Default 8000, max 30000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const finding = jsonArg<AnyRecord>(args.findingJson, {})
    const basePlan = Object.keys(jsonArg<AnyRecord>(args.harnessJson, {})).length
      ? jsonArg<AnyRecord>(args.harnessJson, {})
      : planFor(finding, args.language)
    const language = firstString(
      args.language,
      (basePlan.target as AnyRecord | undefined)?.language,
      finding.language,
      "python",
    )
    const operation = String(args.operation || "plan").toLowerCase()

    if (operation === "plan") {
      const plan = { ...basePlan, skeleton: skeletonFor(basePlan, language) }
      return args.jsonOnly
        ? JSON.stringify(plan, null, 2)
        : ["# CTF Local Harness Plan", JSON.stringify(plan, null, 2)].join("\n")
    }

    if (operation === "write") {
      const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/ctf-harness")
      await mkdir(outDir, { recursive: true })
      const id =
        firstString(basePlan.finding_id, "harness")
          .replace(/[^a-zA-Z0-9_.-]+/g, "_")
          .slice(0, 60) || "harness"
      const relFile = path.join(args.outDir || "work/ctf-harness", `${id}_${Date.now()}${extFor(language)}`)
      const fullFile = resolveInsideWorkspace(context.directory, relFile)
      const content = args.code ?? skeletonFor(basePlan, language)
      await writeFile(fullFile, content, "utf8")
      const result = {
        harness_file: relFile,
        language,
        safety: safetyScan(content, Boolean(args.allowDangerous)),
        plan: basePlan,
      }
      return args.jsonOnly
        ? JSON.stringify(result, null, 2)
        : `harness written: ${relFile}\nlanguage: ${language}\nsafety_ok: ${result.safety.ok}\nsafety_hits: ${result.safety.hits.join(" | ") || "none"}`
    }

    if (operation === "evaluate") {
      let output = args.code || ""
      if (args.harnessFile && !output) {
        const file = resolveInsideWorkspace(context.directory, args.harnessFile)
        output = await readFile(file, "utf8")
      }
      const result = evaluateOutput(output, basePlan)
      return JSON.stringify(result, null, 2)
    }

    if (operation === "run") {
      if (args.allowRun !== true)
        return "Refusing to execute harness: set allowRun=true after reviewing the harness code and confirming it is workspace-local and safe."
      const runner = runnerFor(language)
      if (!runner)
        return `Execution not supported for language '${language}'. Use operation=plan/write and run manually in a sandbox.`
      let fullFile = ""
      let content = args.code || ""
      if (args.harnessFile) {
        fullFile = resolveInsideWorkspace(context.directory, args.harnessFile)
        const st = await stat(fullFile)
        if (!st.isFile()) throw new Error("harnessFile must be a file")
        content = await readFile(fullFile, "utf8")
      } else {
        const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/ctf-harness")
        await mkdir(outDir, { recursive: true })
        const relFile = path.join(args.outDir || "work/ctf-harness", `run_${Date.now()}${extFor(language)}`)
        fullFile = resolveInsideWorkspace(context.directory, relFile)
        content = content || skeletonFor(basePlan, language)
        await writeFile(fullFile, content, "utf8")
      }
      const safety = safetyScan(content, Boolean(args.allowDangerous))
      if (!safety.ok) {
        return `Refusing to execute harness: safety scan found risky patterns (${safety.hits.join(" | ")}). Mock side effects instead, or set allowDangerous=true only with a High-Risk Action Plan.`
      }
      const timeout = Math.max(1000, Math.min(args.timeoutMs ?? 8000, 30000))
      let stdout = ""
      let stderr = ""
      let exitCode: number | string = 0
      let timedOut = false
      const res = await safeExecWithStreams(runner.cmd, [...runner.args, fullFile], {
        cwd: context.directory,
        timeoutMs: timeout,
        maxBuffer: 1024 * 1024,
      })
      stdout = res.stdout
      stderr = res.stderr
      if (!res.ok) {
        exitCode = res.exitCode ?? "error"
        timedOut = /timeout|timed out/i.test(res.stderr)
      }
      const output = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`
      const evalResult = evaluateOutput(output, basePlan)
      const result = {
        harness_file: path.relative(context.directory, fullFile),
        language,
        exit_code: exitCode,
        timeout: timedOut,
        safety,
        ...evalResult,
      }
      if (args.jsonOnly) return JSON.stringify(result, null, 2)
      return [
        "# CTF Local Harness Run",
        `harness_file: ${result.harness_file}`,
        `language: ${language}`,
        `exit_code: ${exitCode}`,
        `timeout: ${timedOut}`,
        `safety_ok: ${safety.ok}`,
        `verdict: ${result.verdict}`,
        `chain_implication: ${result.chain_implication}`,
        "",
        "## Output",
        output.slice(0, 6000),
      ].join("\n")
    }

    throw new Error(`unknown operation: ${operation}`)
  },
})
