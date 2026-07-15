import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function works(cmd: string, args: string[]) {
  try {
    await execFile(cmd, args, { timeout: 4000, maxBuffer: 256 * 1024, shell: process.platform === "win32" })
    return true
  } catch {
    return false
  }
}

async function choosePython() {
  const candidates: Array<[string, string[]]> = process.platform === "win32"
    ? [["python", ["--version"]], ["py", ["-3", "--version"]], ["python3", ["--version"]]]
    : [["python3", ["--version"]], ["python", ["--version"]]]
  for (const [cmd, args] of candidates) if (await works(cmd, args)) return { cmd, baseArgs: cmd === "py" ? ["-3"] : [] }
  throw new Error("No working Python launcher found (tried python, py, python3).")
}

function hasMainGuard(code: string) {
  return /if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(code)
}

export default tool({
  description: "CTF Python parallel runner: write a real .py file and execute multiprocessing-safe Python on Windows with explicit __main__ guard checks.",
  args: {
    code: tool.schema.string().describe("Python code to execute."),
    workdir: tool.schema.string().optional().describe("Workspace-relative working directory. Default current directory."),
    scriptPath: tool.schema.string().optional().describe("Workspace-relative script path. Default work/python-parallel/run.py."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 60000."),
    argv: tool.schema.array(tool.schema.string()).optional().describe("Optional argv passed to the script."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workdir = resolveInsideWorkspace(context.directory, args.workdir || ".")
    const scriptPath = resolveInsideWorkspace(context.directory, args.scriptPath || "work/python-parallel/run.py")
    await mkdir(path.dirname(scriptPath), { recursive: true })
    if (process.platform === "win32" && !hasMainGuard(args.code)) {
      throw new Error("Windows multiprocessing-safe execution requires `if __name__ == '__main__':` in the script. Add the guard and retry.")
    }
    await writeFile(scriptPath, args.code.endsWith("\n") ? args.code : `${args.code}\n`, "utf8")
    const py = await choosePython()
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 60000, 10 * 60 * 1000))
    const argv = args.argv || []
    const { stdout, stderr } = await execFile(py.cmd, [...py.baseArgs, scriptPath, ...argv], {
      cwd: workdir,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === "win32",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    })
    const payload = { ok: true, python: `${py.cmd} ${py.baseArgs.join(" ")}`.trim(), scriptPath, workdir, argv, stdout: stdout.trim(), stderr: stderr.trim() }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return ["PYTHON_PARALLEL:", "- ok: true", `- python: ${payload.python}`, `- script: ${payload.scriptPath}`, `- workdir: ${payload.workdir}`, `- argv: ${payload.argv.join(" ") || "<none>"}`, "- stdout:", payload.stdout, "- stderr:", payload.stderr].join("\n")
  },
})
