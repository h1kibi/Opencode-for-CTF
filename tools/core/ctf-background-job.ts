import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import { existsSync, openSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

function safeId(input: string) {
  return input.replace(/[^A-Za-z0-9_.-]+/g, "_")
}

function resolveJobDir(root: string, id: string) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(root, id)
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("job id must resolve to a child directory under work/background-jobs")
  }
  return resolved
}

const SENSITIVE_NAME = /(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|COOKIE|AUTH|PRIVATE[_-]?KEY|CREDENTIAL)/i

function redactUrl(raw: string) {
  const trailing = raw.match(/[),.;:]+$/)?.[0] || ""
  const value = trailing ? raw.slice(0, -trailing.length) : raw
  try {
    const url = new URL(value)
    if (url.username || url.password) {
      url.username = url.username ? "REDACTED" : ""
      url.password = url.password ? "REDACTED" : ""
    }
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_NAME.test(key)) url.searchParams.set(key, "REDACTED")
    }
    return url.toString() + trailing
  } catch {
    return raw
  }
}

function redactText(input: string) {
  let output = input
  const secretValues = Object.entries(process.env)
    .filter(([name, value]) => SENSITIVE_NAME.test(name) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length)
  for (const secret of secretValues) output = output.split(secret).join("REDACTED")
  output = output.replace(
    /\b([A-Z][A-Z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|COOKIE|AUTH|PRIVATE[_-]?KEY|CREDENTIAL)[A-Z0-9_-]*)=([^\s&;,]+)/gi,
    (_match, name: string) => `${name}=REDACTED`,
  )
  output = output.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactUrl(url))
  return output
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

async function stopProcess(pid: number): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform === "win32") {
    const taskkill = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false })
      let stderr = ""
      killer.stderr?.on("data", (d: Buffer) => (stderr += d.toString()))
      killer.on("error", () => resolve({ ok: false, reason: "taskkill failed to start" }))
      killer.on("exit", (code) => {
        if (code === 0) resolve({ ok: true })
        else resolve({ ok: false, reason: `taskkill exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}` })
      })
    })
    if (taskkill.ok) return taskkill
    const psStop = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      const stopper = spawn(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${pid} -Force`],
        { shell: false },
      )
      let stderr = ""
      stopper.stderr?.on("data", (d: Buffer) => (stderr += d.toString()))
      stopper.on("error", () => resolve({ ok: false, reason: "Stop-Process failed to start" }))
      stopper.on("exit", (code) => {
        if (code === 0) resolve({ ok: true })
        else
          resolve({ ok: false, reason: `Stop-Process exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}` })
      })
    })
    return psStop.ok
      ? psStop
      : {
          ok: false,
          reason: `${taskkill.reason || "taskkill failed"}; fallback: ${psStop.reason || "Stop-Process failed"}`,
        }
  }
  try {
    process.kill(pid, "SIGTERM")
    return { ok: true }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ESRCH") return { ok: true, reason: "process already gone" }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
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
    operation: tool.schema.string().describe("start | status | checkpoint | collect | stop | read"),
    id: tool.schema
      .string()
      .optional()
      .describe("Job id for status/stop/read/checkpoint/collect, or preferred id for start."),
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
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const root = resolveInsideWorkspace(workspace, "work/background-jobs")
    await mkdir(root, { recursive: true })
    const op = args.operation

    if (op === "start") {
      const id = safeId(args.id || `job-${Date.now()}`)
      const jobDir = resolveJobDir(root, id)
      await mkdir(jobDir, { recursive: true })
      const runner = await chooseRunner(args.lang || "python")
      const workdir = resolveFromDirectoryInsideWorkspace(directory, workspace, args.workdir || ".")
      const scriptPath = args.scriptPath
        ? resolveFromDirectoryInsideWorkspace(directory, workspace, args.scriptPath)
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
        schemaVersion: 2,
        lang: args.lang || "python",
        pid,
        scriptPath,
        workdir,
        stdoutPath,
        stderrPath,
        startedAt: new Date().toISOString(),
        argv: (args.argv || []).map((value) => redactText(value)),
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
    if (!id) throw new Error("id is required for status/stop/read/checkpoint/collect")
    const jobDir = resolveJobDir(root, id)
    const metaPath = path.join(jobDir, "job.json")
    const meta = await readJson(metaPath)
    if (!meta) throw new Error(`job not found: ${id}`)

    async function readStreams() {
      const rawStdout = existsSync(meta.stdoutPath) ? await readFile(meta.stdoutPath, "utf8") : ""
      const rawStderr = existsSync(meta.stderrPath) ? await readFile(meta.stderrPath, "utf8") : ""
      return {
        rawStdout,
        rawStderr,
        stdout: redactText(rawStdout),
        stderr: redactText(rawStderr),
      }
    }

    if (op === "checkpoint" || op === "collect") {
      const streams = await readStreams()
      const checkpointPath = path.join(jobDir, "checkpoint.json")
      const previous = (await readJson(checkpointPath)) || { stdoutBytes: 0, stderrBytes: 0 }
      const stdoutBytes = Buffer.byteLength(streams.rawStdout)
      const stderrBytes = Buffer.byteLength(streams.rawStderr)
      const delta = {
        stdout: redactText(
          Buffer.from(streams.rawStdout)
            .subarray(Number(previous.stdoutBytes) || 0)
            .toString("utf8"),
        ),
        stderr: redactText(
          Buffer.from(streams.rawStderr)
            .subarray(Number(previous.stderrBytes) || 0)
            .toString("utf8"),
        ),
      }
      const checkpoint = {
        id,
        capturedAt: new Date().toISOString(),
        stdoutBytes,
        stderrBytes,
        running: isPidAlive(Number(meta.pid)),
      }
      await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8")
      const payload = {
        ok: true,
        id,
        operation: op,
        running: checkpoint.running,
        partial: checkpoint.running || stdoutBytes > 0 || stderrBytes > 0,
        checkpoint,
        stdout: op === "collect" ? streams.stdout : delta.stdout,
        stderr: op === "collect" ? streams.stderr : delta.stderr,
        next: checkpoint.running
          ? "ctf-background-job operation=checkpoint"
          : "job complete; collect for the final output",
      }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return JSON.stringify(payload, null, 2)
    }

    if (op === "status") {
      const { stdout, stderr } = await readStreams()
      const payload = {
        ok: true,
        id,
        running: isPidAlive(meta.pid),
        pid: meta.pid,
        startedAt: meta.startedAt,
        stdoutTail: redactText(stdout).split(/\r?\n/).slice(-20).join("\n"),
        stderrTail: redactText(stderr).split(/\r?\n/).slice(-20).join("\n"),
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
      const killed = await stopProcess(Number(meta.pid))
      if (!killed.ok && isPidAlive(Number(meta.pid))) {
        const payload = { ok: false, id, stopped: false, pid: meta.pid, error: killed.reason || "stop failed" }
        if (args.jsonOnly) return JSON.stringify(payload, null, 2)
        return [
          "CTF_BACKGROUND_JOB:",
          "- operation: stop",
          `- id: ${id}`,
          "- stopped: false",
          `- pid: ${meta.pid}`,
          `- error: ${payload.error}`,
        ].join("\n")
      }
      const payload = {
        ok: true,
        id,
        stopped: true,
        pid: meta.pid,
        ...(killed.reason ? { note: killed.reason } : {}),
      }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "CTF_BACKGROUND_JOB:",
        "- operation: stop",
        `- id: ${id}`,
        "- stopped: true",
        `- pid: ${meta.pid}`,
        ...(killed.reason ? [`- note: ${killed.reason}`] : []),
      ].join("\n")
    }

    if (op === "read") {
      const streams = await readStreams()
      const payload = { ok: true, id, stdout: streams.stdout, stderr: streams.stderr }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "CTF_BACKGROUND_JOB:",
        "- operation: read",
        `- id: ${id}`,
        "- stdout:",
        payload.stdout,
        "- stderr:",
        payload.stderr,
      ].join("\n")
    }

    throw new Error(`unsupported operation: ${op}`)
  },
})
