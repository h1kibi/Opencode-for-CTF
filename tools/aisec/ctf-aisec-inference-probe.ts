import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import { resolveFromDirectoryInsideWorkspace, workspaceRootFromContext, directoryFromContext } from "../lib/workspace-path.ts"

type RunRecord = {
  index: number
  ok: boolean
  exit_code: number | null
  duration_ms: number
  stdout: string
  stderr: string
  response_shape: string
}

function shapeOf(stdout: string): string {
  const trimmed = stdout.trim()
  if (!trimmed) return "empty"
  try {
    const value = JSON.parse(trimmed) as unknown
    if (value === null) return "null"
    if (Array.isArray(value)) return `array(${value.length})`
    if (typeof value === "object") return `object(${Object.keys(value as object).slice(0, 12).join(",")})`
    return typeof value
  } catch {
    return "text"
  }
}

function normalized(stdout: string): string {
  try {
    return JSON.stringify(JSON.parse(stdout))
  } catch {
    return stdout.replace(/\r\n/g, "\n").trim()
  }
}

export default tool({
  description:
    "Bounded local AI inference baseline harness: runs an explicitly supplied command against a workspace input file, records latency/output shape/determinism, and avoids shell interpretation.",
  args: {
    command: tool.schema.string().describe("Executable name or path, for example python, node, or a challenge wrapper."),
    argv: tool.schema.array(tool.schema.string()).describe("Arguments; use the literal {input_file} where the wrapper should receive the generated input file."),
    input: tool.schema.string().describe("One benign baseline input or authorized test case. Max 64 KiB."),
    workdir: tool.schema.string().optional().describe("Workspace-relative working directory for the wrapper."),
    repetitions: tool.schema.number().optional().describe("Number of identical runs, 1-5. Default 2."),
    timeoutMs: tool.schema.number().optional().describe("Per-run timeout, clamped to 1-60 seconds. Default 10 seconds."),
    jsonOnly: tool.schema.boolean().optional().describe("Return machine-readable JSON only."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const workdir = resolveFromDirectoryInsideWorkspace(directory, workspace, args.workdir || ".")
    if (args.input.length > 64 * 1024) return "[ctf-aisec-inference-probe] input exceeds 64 KiB limit"
    const repetitions = Math.max(1, Math.min(Math.floor(args.repetitions ?? 2), 5))
    const timeoutMs = Math.max(1000, Math.min(Math.floor(args.timeoutMs ?? 10000), 60000))
    if (!args.argv.some((value) => value.includes("{input_file}"))) {
      return "[ctf-aisec-inference-probe] argv must include {input_file}; stdin and shell command strings are intentionally unsupported."
    }

    const runDir = path.join(workspace, "work", "aisec-probe")
    await mkdir(runDir, { recursive: true })
    const inputPath = path.join(runDir, `input-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`)
    await writeFile(inputPath, args.input, "utf8")
    const argv = args.argv.map((value) => value.replaceAll("{input_file}", inputPath))
    const records: RunRecord[] = []

    for (let index = 0; index < repetitions; index++) {
      const started = performance.now()
      const result = await safeExecWithStreams(args.command, argv, {
        cwd: workdir,
        timeoutMs,
        maxBuffer: 256 * 1024,
        shell: false,
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      })
      const duration = Math.round(performance.now() - started)
      records.push({
        index: index + 1,
        ok: result.ok,
        exit_code: result.exitCode,
        duration_ms: duration,
        stdout: result.stdout.slice(0, 128 * 1024),
        stderr: result.stderr.slice(0, 64 * 1024),
        response_shape: shapeOf(result.stdout),
      })
    }

    const outputs = records.map((record) => normalized(record.stdout))
    const deterministic = outputs.length <= 1 || outputs.every((output) => output === outputs[0])
    const output = {
      schema_version: 1,
      command: args.command,
      argv,
      workdir,
      input_file: inputPath,
      repetitions,
      timeout_ms: timeoutMs,
      runs: records,
      summary: {
        all_ok: records.every((record) => record.ok),
        deterministic,
        response_shapes: [...new Set(records.map((record) => record.response_shape))],
        latency_ms: records.map((record) => record.duration_ms),
      },
      safety: {
        shell: false,
        network_policy: "not widened by this tool; wrapper remains responsible for its own network behavior",
        input_bounded: true,
        output_bounded: true,
      },
    }
    if (args.jsonOnly) return JSON.stringify(output, null, 2)
    const lines = [
      "=== AI Security Inference Baseline ===",
      `command: ${args.command}`,
      `runs: ${repetitions}  all_ok: ${output.summary.all_ok ? "YES" : "NO"}  deterministic: ${deterministic ? "YES" : "NO"}`,
      `response_shapes: ${output.summary.response_shapes.join(" | ")}`,
      `latency_ms: ${output.summary.latency_ms.join(", ")}`,
      `input_file: ${inputPath}`,
      "",
    ]
    for (const record of records) {
      lines.push(`--- run ${record.index} (${record.ok ? "ok" : "failed"}, ${record.duration_ms} ms, ${record.response_shape}) ---`)
      if (record.stdout) lines.push(record.stdout)
      if (record.stderr) lines.push(`[stderr] ${record.stderr}`)
    }
    return lines.join("\n")
  },
})
