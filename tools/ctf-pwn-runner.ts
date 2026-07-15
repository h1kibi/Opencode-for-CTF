import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

const execFile = promisify(execFileCb)
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g

type LinuxElfAwareness = {
  linuxElfSignals: string[]
  nearbyArtifacts: string[]
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function compact(s: string, max = 12000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  const head = clean.slice(0, Math.floor(max * 0.6))
  const tail = clean.slice(clean.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${clean.length - max} chars]...\n${tail}`
}

function detectShell(text: string) {
  return /\buid=\d+\(|\bgid=\d+\(|\$\s*$|#\s*$|\bwhoami\b|\bid\b|\b\/bin\/sh\b|\b\/bin\/bash\b/i.test(text)
}

function detectCrash(text: string, exitCode: number | string) {
  return /segmentation fault|sigsegv|core dumped|illegal instruction|sigill|sigabrt|abort|bus error|sigbus|traceback \(most recent call last\)/i.test(text) || ["134", "135", "136", "139"].includes(String(exitCode))
}

function detectLinuxElfAwareness(scriptContent: string): LinuxElfAwareness {
  const signals: string[] = []
  const checks: Array<[RegExp, string]> = [
    [/\bELF\s*\(/, "pwntools_ELF()"],
    [/\bprocess\s*\(/, "pwntools_process()"],
    [/\bremote\s*\(/, "pwntools_remote()"],
    [/\bcontext\.binary\b/, "context.binary"],
    [/libc\s*=\s*ELF\s*\(/, "libc_ELF_binding"],
    [/ld[^\r\n=]*=\s*["'][^"']*ld-linux[^"']*["']/, "ld_linux_reference"],
    [/\.(elf|so)(?:["'])/i, "elf_or_shared_object_literal"],
  ]
  for (const [re, label] of checks) {
    if (re.test(scriptContent)) signals.push(label)
  }
  return { linuxElfSignals: signals, nearbyArtifacts: [] }
}

async function detectNearbyLinuxArtifacts(dir: string) {
  const artifacts: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries.slice(0, 80)) {
      if (!entry.isFile()) continue
      if (/^(libc\.so(\.\d+)?)$/i.test(entry.name)) artifacts.push(entry.name)
      else if (/^ld-linux|^ld-.*\.so/i.test(entry.name)) artifacts.push(entry.name)
      else if (/^(chall|pwn|vuln|main|heap|fmt|rop|baby.*|.*\.(elf|bin|out))$/i.test(entry.name)) artifacts.push(entry.name)
    }
  } catch {
    return []
  }
  return artifacts.slice(0, 12)
}

export default tool({
  description: "CTF pwn exploit runner: execute one workspace-local exploit.py/solve.py with timeout and return AutoPwn-style shell/flag/crash/timeout signals.",
  args: {
    script: tool.schema.string().describe("Workspace-relative exploit script, usually exploit.py, solve.py, or work/last_attempt.py."),
    argv: tool.schema.string().optional().describe("Optional extra arguments as a single string. Keep simple; split on whitespace."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 15000, hard cap 120000."),
    flagPattern: tool.schema.string().optional().describe("Optional JavaScript regex source for known flag format."),
    saveLastAttempt: tool.schema.boolean().optional().describe("Copy script content to work/last_attempt.py before execution. Default false."),
    envJson: tool.schema.string().optional().describe("Optional JSON object of environment variables, e.g. {\"REMOTE\":\"1\",\"HOST\":\"host\",\"PORT\":\"31337\"}."),
    remoteHost: tool.schema.string().optional().describe("Optional remote host exposed to the script as HOST and REMOTE=1."),
    remotePort: tool.schema.string().optional().describe("Optional remote port exposed to the script as PORT and REMOTE=1."),
    payloadText: tool.schema.string().optional().describe("Optional payload text to save as a workspace artifact for replay/retro."),
    payloadHex: tool.schema.string().optional().describe("Optional hex payload to save as a workspace artifact for replay/retro."),
    payloadLabel: tool.schema.string().optional().describe("Optional label used in saved payload artifact names."),
    jsonOnly: tool.schema.boolean().optional().describe("Return only a compact JSON summary without output_compact. Default false."),
  },
  async execute(args, context) {
    const script = resolveInsideWorkspace(context.directory, args.script)
    const stat = await lstat(script)
    if (!stat.isFile()) throw new Error("script must be a file")
    if (!/\.(py|sage|sh|js)$/i.test(script)) throw new Error("script extension must be .py, .sage, .sh, or .js")

    const cwd = path.dirname(script)
    const scriptContent = await readFile(script, "utf8")
    const awareness = detectLinuxElfAwareness(scriptContent)
    awareness.nearbyArtifacts = await detectNearbyLinuxArtifacts(cwd)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 15000, 120000))
    const extra = (args.argv || "").split(/\s+/).filter(Boolean).slice(0, 20)
    const ext = path.extname(script).toLowerCase()
    const command = ext === ".js" ? "node" : ext === ".sh" ? "bash" : ext === ".sage" ? "sage" : "python"
    const cmdArgs = [script, ...extra]
    const extraEnv: Record<string, string> = {}
    if (args.envJson) {
      const parsed = JSON.parse(args.envJson) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`invalid env var name: ${k}`)
        extraEnv[k] = String(v)
      }
    }
    if (args.remoteHost) {
      extraEnv.REMOTE = "1"
      extraEnv.HOST = args.remoteHost
    }
    if (args.remotePort) {
      extraEnv.REMOTE = "1"
      extraEnv.PORT = args.remotePort
    }

    if (args.saveLastAttempt) {
      const work = resolveInsideWorkspace(context.directory, "work")
      await mkdir(work, { recursive: true })
      const last = resolveInsideWorkspace(context.directory, "work/last_attempt.py")
      await writeFile(last, scriptContent, "utf8")
    }

    let payloadCapturePath = ""
    if (args.payloadText || args.payloadHex) {
      const payloadRel = `work/pwn_runner_payloads/${Date.now()}-${(args.payloadLabel || "stage").replace(/[^A-Za-z0-9_.-]+/g, "-")}${args.payloadHex ? ".bin" : ".txt"}`
      payloadCapturePath = resolveInsideWorkspace(context.directory, payloadRel)
      await mkdir(path.dirname(payloadCapturePath), { recursive: true })
      if (args.payloadHex) await writeFile(payloadCapturePath, Buffer.from(String(args.payloadHex).replace(/[^0-9a-fA-F]/g, ""), "hex"))
      else await writeFile(payloadCapturePath, String(args.payloadText || ""), "utf8")
    }

    const hostPlatform = process.platform
    const linuxElfLike = awareness.linuxElfSignals.length > 0 || awareness.nearbyArtifacts.some((name) => /libc\.so|ld-linux|\.elf$|\.so$|^(chall|pwn|vuln|main|heap|fmt|rop|baby)/i.test(name))
    if (hostPlatform === "win32" && linuxElfLike) {
      const summary = {
        script,
        schema_version: "pwn_runner_summary.v1",
        host_platform: hostPlatform,
        host_execution_blocked: true,
        linux_elf_signals_detected: awareness.linuxElfSignals,
        nearby_linux_artifacts: awareness.nearbyArtifacts,
        recommended_runner: "ctf-pwn-docker-runner",
        recommended_alt: "ctf-pwn-wsl-runner",
        root_cause_category: "tool_policy_guardrail",
        reason: "Windows host detected with Linux ELF/pwntools signals; direct host execution is likely to fail with loader/runtime mismatch (for example WinError 193).",
      }
      if (args.jsonOnly) return JSON.stringify({ pwn_runner_summary: summary }, null, 2)
      return [
        "pwn_runner_summary:",
        "- schema_version: pwn_runner_summary.v1",
        `- script: ${script}`,
        `- host_platform: ${hostPlatform}`,
        "- host_execution_blocked: true",
        `- linux_elf_signals_detected: ${awareness.linuxElfSignals.length ? awareness.linuxElfSignals.join(" | ") : "none"}`,
        `- nearby_linux_artifacts: ${awareness.nearbyArtifacts.length ? awareness.nearbyArtifacts.join(" | ") : "none"}`,
        "- recommended_runner: ctf-pwn-docker-runner",
        "- recommended_alt: ctf-pwn-wsl-runner",
        `- reason: ${summary.reason}`,
        "contract:",
        "- On Windows, do not treat direct host execution of Linux ELF pwntools scripts as a valid default verifier.",
        "- Lock one Linux substrate first, then verify with ctf-pwn-docker-runner or ctf-pwn-wsl-runner.",
      ].join("\n")
    }

    let stdout = ""
    let stderr = ""
    let exitCode: number | string = 0
    let timedOut = false
    try {
      const res = await execFile(command, cmdArgs, { cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, ...extraEnv } })
      stdout = res.stdout
      stderr = res.stderr
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number | string; signal?: string; killed?: boolean; message?: string }
      stdout = e.stdout ?? ""
      stderr = e.stderr ?? e.message ?? ""
      exitCode = e.code ?? e.signal ?? "error"
      timedOut = Boolean(e.killed) || /timed out|timeout/i.test(String(e.message ?? ""))
    }

    const output = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`
    const flagRe = args.flagPattern ? new RegExp(args.flagPattern, "g") : FLAG_RE
    const flags = Array.from(new Set(output.match(flagRe) ?? [])).slice(0, 10)
    const shellDetected = detectShell(output)
    const crash = detectCrash(output, exitCode)
    const scriptRanOk = exitCode === 0 && !timedOut
    const flagDetected = flags.length > 0
    const localSuccess = flagDetected || (shellDetected && !crash && !timedOut)
    const envRemote = extraEnv.REMOTE === "1"
    const remoteSuccess = envRemote ? localSuccess : "untested"
    const summary = {
      script,
      schema_version: "pwn_runner_summary.v1",
      command,
      argv: cmdArgs,
      env_remote: envRemote,
      env_host: extraEnv.HOST ?? "",
      env_port: extraEnv.PORT ?? "",
      script_ran_ok: scriptRanOk,
      local_success: localSuccess,
      remote_success: remoteSuccess,
      root_cause_category: timedOut ? "challenge_timeout_or_wait" : crash ? "challenge_crash" : scriptRanOk ? "success_or_clean_exit" : "tool_or_runtime_failure",
      flag_detected: flagDetected,
      shell_detected: shellDetected,
      crash,
      timeout: timedOut,
      exit_code: exitCode,
      flags_found: flags,
      payload_capture_path: payloadCapturePath,
    }

    if (args.jsonOnly) return JSON.stringify({ pwn_runner_summary: summary }, null, 2)

    return [
      "pwn_runner_summary:",
      "- schema_version: pwn_runner_summary.v1",
      `- script: ${script}`,
      `- command: ${command} ${cmdArgs.map((x) => JSON.stringify(x)).join(" ")}`,
      `- env_remote: ${envRemote ? "yes" : "no"}`,
      `- env_host: ${extraEnv.HOST ?? ""}`,
      `- env_port: ${extraEnv.PORT ?? ""}`,
      `- script_ran_ok: ${scriptRanOk}`,
      `- local_success: ${localSuccess}`,
      `- remote_success: ${remoteSuccess}`,
      `- root_cause_category: ${summary.root_cause_category}`,
      `- flag_detected: ${flagDetected}`,
      `- shell_detected: ${shellDetected}`,
      `- crash: ${crash}`,
      `- timeout: ${timedOut}`,
      `- exit_code: ${exitCode}`,
      `- flags_found: ${flags.length ? flags.join(" | ") : "none"}`,
      `- payload_capture_path: ${payloadCapturePath}`,
      "contract:",
      "- script_ran_ok is not success.",
      "- A shell prompt is not enough; confirm with a harmless command or flag read when in CTF scope.",
      "- SIGSEGV after payload is failure unless the flag was already verified.",
      "output_compact:",
      compact(output),
    ].join("\n")
  },
})
