import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function toWslPath(winPath: string) {
  const normalized = path.resolve(winPath).replace(/\\/g, "/")
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (drive) return `/mnt/${drive[1].toLowerCase()}/${drive[2]}`
  return normalized.replace(/\\/g, "/")
}

function compact(s: string, max = 12000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  const head = clean.slice(0, Math.floor(max * 0.6))
  const tail = clean.slice(clean.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${clean.length - max} chars]...\n${tail}`
}

function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
}

function filterKnownWslNoise(s: string) {
  const noisePatterns = [
    /localhost.+nat/i,
    /nat.+localhost/i,
    /wsl.+localhost/i,
    /proxy configuration was detected/i,
    /mirrored networking mode/i,
    /automatic proxy/i,
    /resolv\.conf/i,
    /wsl:.*network/i,
    /vsock/i,
    /localhost forwarding/i,
    /wsl nat/i,
    /proxy settings/i,
    /dns tunneling/i,
    /mirrored mode networking/i,
  ]
  const lines = stripAnsi(s).split(/\r?\n/)
  const filtered: string[] = []
  let droppingNoiseBlock = false
  for (const line of lines) {
    const trimmed = line.trim()
    const isNoise = noisePatterns.some((re) => re.test(trimmed))
    if (isNoise) {
      droppingNoiseBlock = true
      continue
    }
    if (droppingNoiseBlock && !trimmed) {
      droppingNoiseBlock = false
      continue
    }
    if (droppingNoiseBlock && /^wsl:/i.test(trimmed)) continue
    filtered.push(line)
  }
  return filtered.join("\n").replace(/^\n+|\n+$/g, "")
}

function firstUsefulLine(s: string) {
  return (
    stripAnsi(s)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || ""
  )
}

function countNoiseRemoved(original: string, filtered: string) {
  const originalLines = stripAnsi(original)
    .split(/\r?\n/)
    .filter((line) => line.trim()).length
  const filteredLines = stripAnsi(filtered)
    .split(/\r?\n/)
    .filter((line) => line.trim()).length
  return Math.max(0, originalLines - filteredLines)
}

type FailureKind =
  | "none"
  | "command_not_found"
  | "missing_file"
  | "permission_denied"
  | "timeout"
  | "wsl_startup_failure"
  | "script_execution_failure"
  | "unknown"

function classifyFailure(detail: string, timedOut: boolean, exitCode: number | string, healthOk: boolean): FailureKind {
  const text = stripAnsi(detail)
  if (!text.trim() && !timedOut && (exitCode === 0 || exitCode === "0")) return "none"
  if (timedOut || /timed out|timeout/i.test(text)) return "timeout"
  if (/command not found|not recognized as an internal or external command/i.test(text)) return "command_not_found"
  if (/no such file or directory|cannot find the file|not found/i.test(text)) return "missing_file"
  if (/permission denied|access is denied|operation not permitted/i.test(text)) return "permission_denied"
  if (!healthOk && (/wsl/i.test(text) || /failed to translate|mount.*failed|distribution.*not found/i.test(text)))
    return "wsl_startup_failure"
  if (String(exitCode) !== "0") return "script_execution_failure"
  return "unknown"
}

function suggestedFix(kind: FailureKind) {
  switch (kind) {
    case "none":
      return "none"
    case "command_not_found":
      return "install the missing Linux tool in the active WSL distro or move this probe to the locked Docker substrate"
    case "missing_file":
      return "verify workdir/script path and that mounted workspace files exist inside WSL before rerunning"
    case "permission_denied":
      return "check file permissions, execution bit, and WSL mount accessibility before rerunning"
    case "timeout":
      return "increase timeoutMs only if the probe is expected to run longer; otherwise reduce scope or switch to Docker"
    case "wsl_startup_failure":
      return "repair WSL startup/mount state or avoid WSL for this branch and use Docker instead"
    case "script_execution_failure":
      return "inspect primary_error_line and rerun one narrower probe rather than expanding the script"
    default:
      return "inspect primary_error_line and health_detail, then decide whether the active substrate should remain WSL"
  }
}

async function runWslHealth(wslWorkdir: string, wslScript: string, timeoutMs: number) {
  const { stdout, stderr } = await safeExecWithStreams(
    "wsl",
    [
      "bash",
      "-lc",
      `test -d ${JSON.stringify(wslWorkdir)} && test -f ${JSON.stringify(wslScript)} && command -v bash >/dev/null && echo __WSL_HEALTH_OK__`,
    ],
    { timeoutMs: Math.min(timeoutMs, 8000), maxBuffer: 256 * 1024 },
  )
  const output = `${stdout}\n${stderr}`
  return { ok: output.includes("__WSL_HEALTH_OK__"), detail: output.trim() || "health probe produced no output" }
}

export default tool({
  description:
    "CTF pwn WSL runner: write or run a workspace-local script under WSL to avoid PowerShell/WSL quoting interference.",
  args: {
    script: tool.schema.string().describe("Bash script content to execute under WSL."),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative working directory. Default current workspace root."),
    timeoutMs: tool.schema
      .number()
      .optional()
      .describe("Execution timeout in milliseconds. Default 15000, hard cap 120000."),
    envJson: tool.schema
      .string()
      .optional()
      .describe("Optional JSON object of environment variables for the WSL process."),
    suppressKnownNoise: tool.schema
      .boolean()
      .optional()
      .describe("Filter known WSL localhost/NAT/proxy stderr noise. Default true."),
    scriptPath: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative path to write the script. Default work/wsl_probe.sh."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON summary only. Default false."),
    healthOnly: tool.schema
      .boolean()
      .optional()
      .describe("Run only a quiet WSL health check for startup, mount, and script visibility. Default false."),
  },
  async execute(args, context) {
    const workdirRel = args.workdir || "."
    const workdir = resolveInsideWorkspace(context.directory, workdirRel)
    const stat = await lstat(workdir)
    if (!stat.isDirectory()) throw new Error("workdir must be a directory")

    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 15000, 120000))
    const scriptRel = args.scriptPath || "work/wsl_probe.sh"
    const scriptPath = resolveInsideWorkspace(context.directory, scriptRel)
    await mkdir(path.dirname(scriptPath), { recursive: true })

    const content = args.script.startsWith("#!")
      ? args.script
      : `#!/usr/bin/env bash\nset -euo pipefail\n${args.script}\n`
    await writeFile(scriptPath, content, "utf8")

    const extraEnv: Record<string, string> = {}
    if (args.envJson) {
      const parsed = JSON.parse(args.envJson) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`invalid env var name: ${k}`)
        extraEnv[k] = String(v)
      }
    }

    const suppressKnownNoise = args.suppressKnownNoise !== false

    const wslScript = toWslPath(scriptPath)
    const wslWorkdir = toWslPath(workdir)
    const health = await runWslHealth(wslWorkdir, wslScript, timeoutMs)
    if (args.healthOnly) {
      const filteredHealthDetail = suppressKnownNoise ? filterKnownWslNoise(health.detail) : health.detail
      const healthFailureKind = classifyFailure(health.detail, false, health.ok ? 0 : "error", health.ok)
      const payload = {
        schema_version: "pwn_wsl_runner.v2",
        health_only: true,
        wsl_workdir: wslWorkdir,
        wsl_script_path: wslScript,
        wsl_ok: health.ok,
        failure_kind: healthFailureKind,
        primary_error_line: firstUsefulLine(filteredHealthDetail || health.detail) || "none",
        suggested_fix: suggestedFix(healthFailureKind),
        noise_lines_removed: countNoiseRemoved(health.detail, filteredHealthDetail),
        health_detail: compact(filteredHealthDetail, 4000),
      }
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : [
            "pwn_wsl_runner:",
            "- schema_version: pwn_wsl_runner.v2",
            "- health_only: true",
            `- wsl_ok: ${health.ok}`,
            `- failure_kind: ${healthFailureKind}`,
            `- primary_error_line: ${firstUsefulLine(filteredHealthDetail || health.detail) || "none"}`,
            `- suggested_fix: ${suggestedFix(healthFailureKind)}`,
            `- noise_lines_removed: ${countNoiseRemoved(health.detail, filteredHealthDetail)}`,
            `- wsl_workdir: ${wslWorkdir}`,
            `- wsl_script_path: ${wslScript}`,
            "health_detail:",
            compact(filteredHealthDetail, 4000),
          ].join("\n")
    }
    const envPrefix = Object.entries(extraEnv)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ")
    const bashCmd = `${envPrefix ? `${envPrefix} ` : ""}bash ${JSON.stringify(wslScript)}`

    let stdout = ""
    let stderr = ""
    let exitCode: number | string = 0
    let timedOut = false
    const res = await safeExecWithStreams("wsl", ["bash", "-lc", `cd ${JSON.stringify(wslWorkdir)} && ${bashCmd}`], {
      cwd: context.directory,
      timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    })
    stdout = res.stdout
    stderr = res.stderr
    if (!res.ok) {
      exitCode = res.exitCode ?? "error"
      timedOut = /timeout|timed out/i.test(res.stderr)
    }

    const savedScript = await readFile(scriptPath, "utf8")
    const filteredStderr = suppressKnownNoise ? filterKnownWslNoise(stderr) : stderr
    const output = `${stdout}${filteredStderr ? `\n[stderr]\n${filteredStderr}` : ""}`
    const failureKind = classifyFailure(`${stdout}\n${stderr}`, timedOut, exitCode, health.ok)
    const primaryErrorLine = firstUsefulLine(filteredStderr || stderr || stdout || health.detail)
    const noiseLinesRemoved = countNoiseRemoved(stderr, filteredStderr)
    const summary = {
      schema_version: "pwn_wsl_runner.v2",
      script_path: scriptPath,
      wsl_script_path: wslScript,
      workdir,
      wsl_workdir: wslWorkdir,
      wsl_health_ok: health.ok,
      timeout: timedOut,
      suppress_known_noise: suppressKnownNoise,
      noise_lines_removed: noiseLinesRemoved,
      failure_kind: failureKind,
      primary_error_line: primaryErrorLine || "none",
      suggested_fix: suggestedFix(failureKind),
      exit_code: exitCode,
      script_bytes: Buffer.byteLength(savedScript, "utf8"),
    }

    if (args.jsonOnly) return JSON.stringify({ pwn_wsl_runner: summary, output: compact(output) }, null, 2)

    return [
      "pwn_wsl_runner:",
      "- schema_version: pwn_wsl_runner.v2",
      `- script_path: ${scriptPath}`,
      `- wsl_script_path: ${wslScript}`,
      `- workdir: ${workdir}`,
      `- wsl_workdir: ${wslWorkdir}`,
      `- wsl_health_ok: ${health.ok}`,
      `- timeout: ${timedOut}`,
      `- suppress_known_noise: ${suppressKnownNoise}`,
      `- noise_lines_removed: ${noiseLinesRemoved}`,
      `- failure_kind: ${failureKind}`,
      `- primary_error_line: ${primaryErrorLine || "none"}`,
      `- suggested_fix: ${suggestedFix(failureKind)}`,
      `- exit_code: ${exitCode}`,
      `- script_bytes: ${Buffer.byteLength(savedScript, "utf8")}`,
      "contract:",
      "- Use this wrapper when WSL is the active substrate and complex bash quoting through PowerShell would cause drift.",
      "- Prefer script-file execution over inline PowerShell-mediated shell chains for multi-step Linux probes.",
      "- Use healthOnly=true first when you need a quiet probe for WSL startup, mount visibility, or script accessibility.",
      "health_detail:",
      compact(suppressKnownNoise ? filterKnownWslNoise(health.detail) : health.detail, 4000),
      "output_compact:",
      compact(output),
    ].join("\n")
  },
})
