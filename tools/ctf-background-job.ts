import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import { existsSync, openSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function safeId(input: string) {
  return input.replace(/[^A-Za-z0-9_.-]+/g, "_")
}

async function readJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return null
  }
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function chooseRunner(lang: string) {
  if (lang === "python") return { cmd: "python", args: [] as string[], ext: ".py" }
  if (lang === "node") return { cmd: "node", args: [] as string[], ext: ".js" }
  if (lang === "powershell")
    return { cmd: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"], ext: ".ps1" }
  throw new Error(`unsupported lang: ${lang}`)
}

async function startWindowsBackgroundProcess(
  cmd: string,
  args: string[],
  workdir: string,
  stdoutPath: string,
  stderrPath: string,
  launcherPath: string,
) {
  const psBody = [
    `$cmd = ${JSON.stringify(cmd)}`,
    `$argList = @(${args.map((a) => JSON.stringify(a)).join(",")})`,
    `$wd = ${JSON.stringify(workdir)}`,
    `$out = ${JSON.stringify(stdoutPath)}`,
    `$err = ${JSON.stringify(stderrPath)}`,
    `$p = Start-Process -FilePath $cmd -ArgumentList $argList -WorkingDirectory $wd -RedirectStandardOutput $out -RedirectStandardError $err -PassThru`,
    `$p.Id`,
  ].join("\n")
  await writeFile(launcherPath, psBody, "utf8")
  const ps = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcherPath]
  return await new Promise<number>((resolve, reject) => {
    const child = spawn("powershell", ps, { shell: false })
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => {
      out += d.toString()
    })
    child.stderr.on("data", (d) => {
      err += d.toString()
    })
    child.on("error", reject)
    child.on("exit", () => {
      const pid = Number(
        String(out)
          .trim()
          .split(/\r?\n/)
          .find((line) => /^\d+$/.test(line.trim())) || "0",
      )
      if (!pid) reject(new Error(`failed to start background process: ${err || out}`))
      else resolve(pid)
    })
  })
}

export default tool({
  description:
    "CTF background job: start, inspect, stop, and read detached local Python/Node/PowerShell jobs for long-running brute force or analysis tasks.",
  args: {
    operation: tool.schema.string().describe("start | status | stop | read"),
    id: tool.schema.string().optional().describe("Job id for status/stop/read, or preferred id for start."),
    lang: tool.schema.string().optional().describe("python | node | powershell for start."),
    code: tool.schema.string().optional().describe("Inline script code for start."),
    scriptPath: tool.schema.string().optional().describe("Existing workspace-local script path for start."),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative working directory. Default current directory."),
    argv: tool.schema.array(tool.schema.string()).optional().describe("Optional argv for start."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const root = resolveInsideWorkspace(context.directory, "work/background-jobs")
    await mkdir(root, { recursive: true })
    const op = args.operation

    if (op === "start") {
      const id = safeId(args.id || `job-${Date.now()}`)
      const jobDir = path.join(root, id)
      await mkdir(jobDir, { recursive: true })
      const runner = await chooseRunner(args.lang || "python")
      const workdir = resolveInsideWorkspace(context.directory, args.workdir || ".")
      const scriptPath = args.scriptPath
        ? resolveInsideWorkspace(context.directory, args.scriptPath)
        : path.join(jobDir, `run${runner.ext}`)
      if (args.code) await writeFile(scriptPath, args.code.endsWith("\n") ? args.code : `${args.code}\n`, "utf8")
      if (!existsSync(scriptPath)) throw new Error(`script not found: ${scriptPath}`)
      const stdoutPath = path.join(jobDir, "stdout.log")
      const stderrPath = path.join(jobDir, "stderr.log")
      const metaPath = path.join(jobDir, "job.json")
      const launcherPath = path.join(jobDir, "launcher.ps1")
      const fullArgs = [...runner.args, scriptPath, ...(args.argv || [])]
      let pid = 0
      if (process.platform === "win32") {
        pid = await startWindowsBackgroundProcess(runner.cmd, fullArgs, workdir, stdoutPath, stderrPath, launcherPath)
      } else {
        const child = spawn(runner.cmd, fullArgs, {
          cwd: workdir,
          detached: true,
          shell: false,
          stdio: ["ignore", openSync(stdoutPath, "a"), openSync(stderrPath, "a")],
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        })
        child.unref()
        pid = child.pid || 0
      }
      const meta = {
        id,
        lang: args.lang || "python",
        pid,
        scriptPath,
        workdir,
        stdoutPath,
        stderrPath,
        startedAt: new Date().toISOString(),
        argv: args.argv || [],
      }
      await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8")
      const payload = { ok: true, ...meta }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "CTF_BACKGROUND_JOB:",
        "- operation: start",
        "- ok: true",
        `- id: ${id}`,
        `- pid: ${pid}`,
        `- stdout: ${stdoutPath}`,
        `- stderr: ${stderrPath}`,
      ].join("\n")
    }

    const id = safeId(args.id || "")
    if (!id) throw new Error("id is required for status/stop/read")
    const jobDir = path.join(root, id)
    const metaPath = path.join(jobDir, "job.json")
    const meta = await readJson(metaPath)
    if (!meta) throw new Error(`job not found: ${id}`)

    if (op === "status") {
      const stdout = existsSync(meta.stdoutPath) ? await readFile(meta.stdoutPath, "utf8") : ""
      const stderr = existsSync(meta.stderrPath) ? await readFile(meta.stderrPath, "utf8") : ""
      const payload = {
        ok: true,
        id,
        running: isPidAlive(meta.pid),
        pid: meta.pid,
        startedAt: meta.startedAt,
        stdoutTail: stdout.split(/\r?\n/).slice(-20).join("\n"),
        stderrTail: stderr.split(/\r?\n/).slice(-20).join("\n"),
      }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "CTF_BACKGROUND_JOB:",
        "- operation: status",
        `- id: ${id}`,
        `- running: ${payload.running}`,
        `- pid: ${payload.pid}`,
        `- started_at: ${payload.startedAt}`,
        "- stdout_tail:",
        payload.stdoutTail,
        "- stderr_tail:",
        payload.stderrTail,
      ].join("\n")
    }

    if (op === "stop") {
      try {
        if (process.platform === "win32") {
          const killer = spawn("taskkill", ["/PID", String(meta.pid), "/T", "/F"], { shell: false })
          await new Promise<void>((resolve) => {
            killer.on("exit", () => resolve())
            killer.on("error", () => resolve())
          })
        } else {
          process.kill(meta.pid, "SIGTERM")
        }
      } catch {}
      const payload = { ok: true, id, stopped: true, pid: meta.pid }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return ["CTF_BACKGROUND_JOB:", "- operation: stop", `- id: ${id}`, `- stopped: true`, `- pid: ${meta.pid}`].join(
        "\n",
      )
    }

    if (op === "read") {
      const stdout = existsSync(meta.stdoutPath) ? await readFile(meta.stdoutPath, "utf8") : ""
      const stderr = existsSync(meta.stderrPath) ? await readFile(meta.stderrPath, "utf8") : ""
      const payload = { ok: true, id, stdout, stderr }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return ["CTF_BACKGROUND_JOB:", "- operation: read", `- id: ${id}`, "- stdout:", stdout, "- stderr:", stderr].join(
        "\n",
      )
    }

    throw new Error(`unsupported operation: ${op}`)
  },
})
