import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExec, safeExecWithStreams } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function works(cmd: string, args: string[]) {
  const r = await safeExec(cmd, args, { timeoutMs: 4000, maxBuffer: 256 * 1024, shell: process.platform === "win32" })
  return r.ok
}

async function choosePython() {
  const candidates: Array<[string, string[]]> =
    process.platform === "win32"
      ? [
          ["python", ["--version"]],
          ["py", ["-3", "--version"]],
          ["python3", ["--version"]],
        ]
      : [
          ["python3", ["--version"]],
          ["python", ["--version"]],
        ]
  for (const [cmd, args] of candidates) if (await works(cmd, args)) return { cmd, baseArgs: cmd === "py" ? ["-3"] : [] }
  throw new Error("No working Python launcher found (tried python, py, python3).")
}

function looksParallelPython(code: string) {
  return /\bmultiprocessing\b|ProcessPoolExecutor|Pool\(|set_start_method\(/.test(code)
}

function hasMainGuard(code: string) {
  return /if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(code)
}

function classifyFailure(err: { message?: string; stdout?: string; stderr?: string; code?: string | number }) {
  const detail = `${err.message || ""}\n${err.stderr || ""}\n${err.stdout || ""}`
  if (/timed out|timeout/i.test(detail)) return "timeout"
  if (/maxBuffer|ENOBUFS/i.test(detail)) return "stdout_truncated"
  if (/ModuleNotFoundError|ImportError|No module named/i.test(detail)) return "import_error"
  if (/spawn .*ENOENT|No working Python launcher/i.test(detail)) return "spawn_error"
  if (err.code !== undefined) return "nonzero_exit"
  return "unknown"
}

function nextSuggestion(failureKind: string, parallelHint: boolean, hasGuard: boolean) {
  if (parallelHint && process.platform === "win32" && !hasGuard) {
    return "Windows multiprocessing detected: write a real .py file with `if __name__ == '__main__'` or use ctf-python-parallel."
  }
  if (failureKind === "timeout") return "Increase timeoutMs or move this long-running workload to ctf-background-job."
  if (failureKind === "import_error") return "Check module imports and interpreter environment before retrying."
  if (failureKind === "stdout_truncated")
    return "Reduce output volume or write results to a file under work/ before printing."
  if (failureKind === "spawn_error") return "Check Python launcher availability and PATH, then retry."
  if (failureKind === "nonzero_exit") return "Inspect stderr/stdout and rerun one narrower probe."
  return parallelHint
    ? "If this is a CPU-heavy or multiprocessing script, prefer ctf-python-parallel or ctf-background-job."
    : "Inspect stderr/stdout and retry with a narrower script."
}

export default tool({
  description:
    "CTF Python inline runner: write a temporary workspace-local .py file and execute it with a working Python launcher, avoiding PowerShell one-liner pain.",
  args: {
    code: tool.schema.string().describe("Python code to execute."),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative working directory. Default current directory."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 12000."),
    scriptPath: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative temp script path. Default work/python-inline/run.py."),
    argv: tool.schema.array(tool.schema.string()).optional().describe("Optional argv passed to the script."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workdir = resolveInsideWorkspace(context.directory, args.workdir || ".")
    const scriptPath = resolveInsideWorkspace(context.directory, args.scriptPath || "work/python-inline/run.py")
    await mkdir(path.dirname(scriptPath), { recursive: true })
    const code = args.code.startsWith("#!") ? args.code : `${args.code}\n`
    const parallelHint = looksParallelPython(code)
    const mainGuard = hasMainGuard(code)
    await writeFile(scriptPath, code, "utf8")
    const py = await choosePython()
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 12000, 120000))
    const argv = args.argv || []
    const shell_flag = process.platform === "win32"
    const python_env = { ...process.env, PYTHONIOENCODING: "utf-8" }
    const { stdout, stderr, ok, exitCode } = await safeExecWithStreams(py.cmd, [...py.baseArgs, scriptPath, ...argv], {
      cwd: workdir,
      timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      shell: shell_flag,
      env: python_env,
    })
    if (ok) {
      const payload = {
        ok: true,
        python: `${py.cmd} ${py.baseArgs.join(" ")}`.trim(),
        scriptPath,
        workdir,
        argv,
        warning:
          parallelHint && process.platform === "win32"
            ? mainGuard
              ? "Windows multiprocessing detected: prefer a real file execution path or ctf-background-job for long runs."
              : "Windows multiprocessing detected without __main__ guard: inline execution is fragile; prefer ctf-python-parallel or a saved .py file."
            : "",
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "PYTHON_INLINE:",
        `- ok: true`,
        `- python: ${payload.python}`,
        `- script: ${payload.scriptPath}`,
        `- workdir: ${payload.workdir}`,
        `- argv: ${payload.argv.join(" ") || "<none>"}`,
        `- warning: ${payload.warning || "none"}`,
        "- stdout:",
        payload.stdout || "",
        "- stderr:",
        payload.stderr || "",
      ].join("\n")
    }
    const failureKind = classifyFailure({ message: stderr, stdout, stderr, code: exitCode ?? undefined })
    const payload = {
      ok: false,
      python: `${py.cmd} ${py.baseArgs.join(" ")}`.trim(),
      scriptPath,
      workdir,
      argv,
      warning:
        parallelHint && process.platform === "win32"
          ? mainGuard
            ? "Windows multiprocessing detected: prefer a real file execution path or ctf-background-job for long runs."
            : "Windows multiprocessing detected without __main__ guard: inline execution is fragile; prefer ctf-python-parallel or a saved .py file."
          : "",
      failureKind,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      error: stderr.trim() || "python execution failed",
      suggestion: nextSuggestion(failureKind, parallelHint, mainGuard),
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PYTHON_INLINE:",
      `- ok: false`,
      `- python: ${payload.python}`,
      `- script: ${payload.scriptPath}`,
      `- workdir: ${payload.workdir}`,
      `- argv: ${payload.argv.join(" ") || "<none>"}`,
      `- warning: ${payload.warning || "none"}`,
      `- failure_kind: ${payload.failureKind}`,
      `- error: ${payload.error}`,
      `- suggestion: ${payload.suggestion}`,
      "- stdout:",
      payload.stdout || "",
      "- stderr:",
      payload.stderr || "",
    ].join("\n")
  },
})
