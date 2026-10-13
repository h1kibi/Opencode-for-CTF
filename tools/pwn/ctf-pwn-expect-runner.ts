import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import { objectToStringRecord, parseJsonArrayArg, parseJsonObjectArg, parseStringArrayArg } from "../lib/json-args.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { extractFlagCandidates, FLAG_REGEX } from "../../packages/ctf-core/src/flag-rules.ts"
const FLAG_RE = FLAG_REGEX

function collectFlagCandidates(text: string, customPattern?: string) {
  if (customPattern) {
    const regex = new RegExp(customPattern, "g")
    return Array.from(text.matchAll(regex), (match) => match[0]?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 20)
      .map((value) => ({
        value,
        confidence: "medium" as const,
        kind: "custom" as const,
        reason: "matched an explicitly supplied challenge-specific pattern; oracle verification is still required",
        source: "pwn-expect-runner",
      }))
  }
  return extractFlagCandidates(text, { origin: "pwn-expect-runner", source: "interaction-transcript", text }).slice(
    0,
    20,
  )
}

function compact(s: string, max = 12000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  const head = clean.slice(0, Math.floor(max * 0.6))
  const tail = clean.slice(clean.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${clean.length - max} chars]...\n${tail}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryOn(value: string | undefined) {
  const parts = String(value || "eof,error,timeout,parse_error,unknown")
    .split(/[\s,|]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return new Set(parts)
}

function classifyRetryTag(status: string, errorText: string) {
  const err = errorText.toLowerCase()
  if (/timed out|timeout/.test(err)) return "timeout"
  if (status === "eof") return "eof"
  if (status === "parse_error") return "parse_error"
  if (status === "error") return "error"
  if (status === "ok") return "ok"
  return status || "unknown"
}

function computeSleepMs(baseMs: number, jitterMs: number) {
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0
  return baseMs + jitter
}

function detectPromptHint(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trimEnd())
    .filter((x) => x.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (
      /(choice|menu|index|size|len|length|content|name|desc|description|prompt|select|option)\s*[:>]+\s*$/i.test(line)
    )
      return line
    if (/[$#>]\s*$/.test(line)) return line
  }
  return ""
}

function validateContainerPosixPath(input: string, field: string, options?: { allowRoot?: boolean }) {
  if (!input.startsWith("/")) throw new Error(`${field} must be an absolute POSIX path inside the container`)
  const normalized = path.posix.normalize(input)
  if (!options?.allowRoot && normalized === "/") throw new Error(`${field} must not be '/'`)
  return normalized
}

function isInsideContainerTree(child: string, root: string) {
  return child === root || child.startsWith(`${root}/`)
}

function splitArgs(value: string | undefined) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 40)
}

async function looksLikeElf(target: string) {
  try {
    const buf = await readFile(target)
    return buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46
  } catch {
    return false
  }
}

async function loadRuntimeProfile(contextDir: string, profileId?: string) {
  if (!profileId) return null as any
  const profilePath = resolveInsideWorkspace(contextDir, `work/pwn-runtime-profiles/${profileId}.json`)
  return JSON.parse(await readFile(profilePath, "utf8"))
}

export default tool({
  description:
    "CTF pwn expect runner: execute a prompt-aware local/remote/docker interaction script with UTF-8-safe capture, automatic retries, and cooldown pacing for menu and pacing-sensitive PWN workflows.",
  args: {
    mode: tool.schema.string().optional().describe("local | remote | docker. Default local."),
    binary: tool.schema.string().optional().describe("Workspace-relative local binary path for mode=local/docker."),
    argv: tool.schema.string().optional().describe("Optional local argv string, split on whitespace."),
    argvPrefixJson: tool.schema.string().optional().describe("Safer local argv prefix as JSON string array."),
    host: tool.schema.string().optional().describe("Remote host for mode=remote."),
    port: tool.schema.number().optional().describe("Remote port for mode=remote."),
    envJson: tool.schema
      .string()
      .optional()
      .describe("Optional JSON object of environment variables for local/docker mode."),
    runtimeProfileId: tool.schema
      .string()
      .optional()
      .describe(
        "Runtime profile id emitted by ctf-pwn-libc-runtime-doctor. Supplies docker defaults/env when omitted.",
      ),
    stepsJson: tool.schema
      .string()
      .describe(
        "JSON array of interaction steps. Each step may include expect, send, sendHex, line, timeoutMs, and sleepMs.",
      ),
    timeoutMs: tool.schema.number().optional().describe("Global timeout in milliseconds. Default 20000."),
    retries: tool.schema
      .number()
      .optional()
      .describe("Number of automatic retries after a transient failure. Default 0."),
    cooldownMs: tool.schema.number().optional().describe("Delay in milliseconds between attempts. Default 0."),
    retryOn: tool.schema
      .string()
      .optional()
      .describe(
        "Comma-separated retry tags: eof,error,timeout,parse_error,ok,unknown,any. Default retries only transient-looking outcomes.",
      ),
    jitterMs: tool.schema
      .number()
      .optional()
      .describe("Random extra delay in milliseconds added before each retry. Default 0."),
    flagPattern: tool.schema.string().optional().describe("Optional JavaScript regex source for known flag format."),
    composeService: tool.schema
      .string()
      .optional()
      .describe("docker compose service name for exec mode or compose run mode."),
    containerName: tool.schema.string().optional().describe("Explicit container name for docker exec mode."),
    image: tool.schema
      .string()
      .optional()
      .describe("Docker image for docker run mode when no existing container/service should be used."),
    useComposeRun: tool.schema
      .boolean()
      .optional()
      .describe("Use 'docker compose run --rm <service>' instead of exec. Default false."),
    containerWorkdir: tool.schema
      .string()
      .optional()
      .describe("In-container working directory. Default mirrors the binary directory under /work."),
    containerMountRoot: tool.schema
      .string()
      .optional()
      .describe("Container path where the host workspace is mounted for docker run mode. Default /work."),
    runArgs: tool.schema
      .string()
      .optional()
      .describe(
        "Optional extra arguments for docker run or docker compose run, e.g. '--cap-add=SYS_PTRACE --security-opt seccomp=unconfined'.",
      ),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const runtimeProfile = await loadRuntimeProfile(workspace, args.runtimeProfileId)
    const profileDefaults = runtimeProfile?.docker_runner_defaults || {}
    const requestedMode = String(args.mode || "local").toLowerCase()
    const mode =
      requestedMode === "remote"
        ? "remote"
        : requestedMode === "docker" || requestedMode === "compose"
          ? "docker"
          : "local"
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 20000, 120000))

    let binary = ""
    if (mode === "local" || mode === "docker") {
      if (!args.binary) throw new Error("binary is required for local/docker mode")
      binary = resolveFromDirectoryInsideWorkspace(directory, workspace, args.binary)
      const stat = await lstat(binary)
      if (!stat.isFile()) throw new Error("binary must be a file")
    }

    const steps = parseJsonArrayArg<Record<string, unknown>>("stepsJson", args.stepsJson)
    if (!Array.isArray(steps) || steps.length === 0) throw new Error("stepsJson must be a non-empty JSON array")
    const retries = Math.max(0, Math.min(Number(args.retries ?? 0), 20))
    const cooldownMs = Math.max(0, Math.min(Number(args.cooldownMs ?? 0), 60000))
    const jitterMs = Math.max(0, Math.min(Number(args.jitterMs ?? 0), 60000))
    const retryOn = parseRetryOn(args.retryOn)

    const extraEnv: Record<string, string> = {}
    if (args.envJson) {
      Object.assign(extraEnv, objectToStringRecord("envJson", parseJsonObjectArg("envJson", args.envJson)))
    }
    if (runtimeProfile) {
      extraEnv.OPENCODE_PWN_RUNTIME_PROFILE = String(args.runtimeProfileId || runtimeProfile.profile_id || "")
      extraEnv.OPENCODE_PWN_LOADER_CMD = String(runtimeProfile.explicit_loader_command || "")
    }

    const argvParts = args.argvPrefixJson
      ? parseStringArrayArg("argvPrefixJson", args.argvPrefixJson)
      : String(args.argv || "")
          .split(/\s+/)
          .filter(Boolean)

    if (mode === "local" && process.platform === "win32" && (await looksLikeElf(binary))) {
      const summary = {
        mode,
        status: "host_execution_blocked",
        error:
          "Windows host detected with Linux ELF target; use docker mode so process/expect stay on one Linux substrate.",
        recommended_mode: "docker",
        recommended_runner: "ctf-pwn-expect-runner mode=docker",
      }
      if (args.jsonOnly) return JSON.stringify({ pwn_expect_runner: summary }, null, 2)
      return [
        "pwn_expect_runner:",
        "- mode: local",
        "- status: host_execution_blocked",
        `- error: ${summary.error}`,
        "- recommended_mode: docker",
        "- recommended_runner: ctf-pwn-expect-runner mode=docker",
      ].join("\n")
    }

    const tempRoot =
      mode === "docker"
        ? resolveInsideWorkspace(workspace, `work/pwn-expect-runner/${randomUUID().slice(0, 12)}`)
        : await (async () => {
            const tmpDir = await import("node:fs/promises").then((fs) =>
              fs.mkdtemp(path.join(os.tmpdir(), "pwn-expect-runner-")),
            )
            return tmpDir
          })()
    await mkdir(tempRoot, { recursive: true })
    const driver = path.join(tempRoot, "driver.py")

    let effectiveBinaryForDriver = binary
    let driverMode = mode === "remote" ? "remote" : "local"
    let execCommand = "python"
    let execArgs: string[] = [driver]
    let execCwd = mode === "local" ? path.dirname(binary) : workspace

    if (mode === "docker") {
      const composeService = String(args.composeService || profileDefaults.composeService || "")
      const containerName = String(args.containerName || "")
      const image = String(args.image || "")
      const useComposeRun = Boolean(args.useComposeRun)
      const containerMountRoot = validateContainerPosixPath(
        args.containerMountRoot || profileDefaults.containerMountRoot || "/work",
        "containerMountRoot",
      )
      const relBinary = path.relative(workspace, binary).replace(/\\/g, "/")
      effectiveBinaryForDriver = path.posix.join(containerMountRoot, relBinary)
      const relDriver = path.relative(workspace, driver).replace(/\\/g, "/")
      const inContainerDriver = path.posix.join(containerMountRoot, relDriver)
      const relBinaryDir = path.relative(workspace, path.dirname(binary)).replace(/\\/g, "/")
      const defaultContainerWorkdir =
        !relBinaryDir || relBinaryDir === "." ? containerMountRoot : path.posix.join(containerMountRoot, relBinaryDir)
      const containerWorkdir = validateContainerPosixPath(
        args.containerWorkdir || profileDefaults.containerWorkdir || defaultContainerWorkdir,
        "containerWorkdir",
      )
      if (!isInsideContainerTree(containerWorkdir, containerMountRoot)) {
        throw new Error(
          `containerWorkdir must stay under containerMountRoot: ${containerWorkdir} is outside ${containerMountRoot}`,
        )
      }
      const runArgs = splitArgs(args.runArgs || profileDefaults.runArgs || "")
      execCommand = "docker"
      execCwd = workspace
      if (containerName) {
        execArgs = ["exec", "-w", containerWorkdir, containerName, "python3", inContainerDriver]
      } else if (composeService && !useComposeRun) {
        execArgs = ["compose", "exec", "-T", "-w", containerWorkdir, composeService, "python3", inContainerDriver]
      } else if (composeService && useComposeRun) {
        execArgs = [
          "compose",
          "run",
          "--rm",
          "-T",
          "-w",
          containerWorkdir,
          ...runArgs,
          composeService,
          "python3",
          inContainerDriver,
        ]
      } else if (image) {
        execArgs = [
          "run",
          "--rm",
          "-v",
          `${workspace.replace(/\\/g, "/")}:${containerMountRoot}`,
          "-w",
          containerWorkdir,
          ...runArgs,
          image,
          "python3",
          inContainerDriver,
        ]
      } else {
        throw new Error("docker mode requires containerName, composeService, or image")
      }
    }

    const script = `#!/usr/bin/env python3
import json, os, re, time
from pwn import *

MODE = ${JSON.stringify(driverMode)}
BINARY = ${JSON.stringify(effectiveBinaryForDriver)}
ARGV = ${JSON.stringify(argvParts)}
HOST = ${JSON.stringify(String(args.host || ""))}
PORT = ${JSON.stringify(Number(args.port || 0))}
STEPS = json.loads(${JSON.stringify(JSON.stringify(steps))})
FLAG_RE = re.compile(${JSON.stringify(args.flagPattern || FLAG_RE.source)})
TIMEOUT = ${Math.floor(timeoutMs / 1000)}
EXTRA_ENV = json.loads(${JSON.stringify(JSON.stringify(extraEnv))})

context.log_level = 'error'
context.encoding = 'utf-8'

if MODE == 'remote':
    if not HOST or not PORT:
        raise SystemExit('remote mode requires host and port')
    io = remote(HOST, int(PORT), timeout=TIMEOUT)
else:
    io = process([BINARY, *ARGV], env={**os.environ, **EXTRA_ENV})

transcript = []
status = 'ok'
error = ''

def to_bytes(v):
    if v is None:
        return None
    if isinstance(v, bytes):
        return v
    return str(v).encode()

for idx, step in enumerate(STEPS):
    step_timeout = max(0.2, min(float(step.get('timeoutMs', ${timeoutMs})) / 1000.0, TIMEOUT))
    expect = step.get('expect')
    send = step.get('send')
    send_hex = step.get('sendHex')
    line = bool(step.get('line', True))
    sleep_ms = int(step.get('sleepMs', 0) or 0)
    try:
        if expect is not None:
            data = io.recvuntil(to_bytes(expect), timeout=step_timeout)
            transcript.append({'step': idx + 1, 'event': 'expect', 'pattern': str(expect), 'data': data.decode('utf-8', errors='replace')})
        if send_hex is not None:
            payload = bytes.fromhex(str(send_hex).replace(chr(92) + 'x', '').replace(' ', ''))
        elif send is not None:
            payload = to_bytes(send)
        else:
            payload = None
        if payload is not None:
            if line:
                io.sendline(payload)
            else:
                io.send(payload)
            transcript.append({'step': idx + 1, 'event': 'send', 'line_mode': line, 'size': len(payload), 'preview': payload[:48].decode('utf-8', errors='replace')})
        if sleep_ms > 0:
            time.sleep(min(sleep_ms / 1000.0, 5.0))
    except EOFError as exc:
        status = 'eof'
        error = str(exc)
        transcript.append({'step': idx + 1, 'event': 'error', 'kind': 'EOFError', 'message': str(exc)})
        break
    except Exception as exc:
        status = 'error'
        error = str(exc)
        transcript.append({'step': idx + 1, 'event': 'error', 'kind': type(exc).__name__, 'message': str(exc)})
        break

try:
    tail = io.recvrepeat(1.2)
except Exception as exc:
    tail = b''
    if status == 'ok':
        status = 'error'
        error = str(exc)

all_text = ''.join(item.get('data', '') for item in transcript if item.get('event') == 'expect') + tail.decode('utf-8', errors='replace')
raw_pattern_hits = FLAG_RE.findall(all_text)
pattern_hits = []
for item in raw_pattern_hits:
    if isinstance(item, tuple):
        item = item[0] if item else ''
    if item and item not in pattern_hits:
        pattern_hits.append(item)
result = {
    'mode': MODE,
    'status': status,
    'error': error,
    'steps': len(STEPS),
    'pattern_hits': pattern_hits,
    'tail': tail.decode('utf-8', errors='replace'),
    'transcript': transcript,
}
print(json.dumps(result, ensure_ascii=False))
`

    await writeFile(driver, script, "utf8")

    const attemptSummaries: Array<Record<string, unknown>> = []
    let finalParsed: any = {}
    let finalOutput = ""

    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        let stdout = ""
        let stderr = ""
        let exitCode: number | string = 0
        let parsed: any = {}
        const res = await safeExecWithStreams(execCommand, execArgs, {
          cwd: execCwd,
          timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        })
        stdout = res.stdout
        stderr = res.stderr
        if (!res.ok) {
          exitCode = res.exitCode ?? "error"
        }

        finalOutput = `${stdout}${stderr ? `\n${stderr}` : ""}`
        try {
          parsed = JSON.parse(stdout.trim())
        } catch {
          parsed = { status: "parse_error", tail: finalOutput, transcript: [] }
        }

        const attemptSummary = {
          attempt: attempt + 1,
          status: parsed.status || "unknown",
          steps: parsed.steps || steps.length,
          pattern_hits: parsed.pattern_hits || [],
          candidate_detected: Array.isArray(parsed.pattern_hits) && parsed.pattern_hits.length > 0,
          eof: parsed.status === "eof",
          error: parsed.error || String(exitCode || ""),
        }
        const retryTag = classifyRetryTag(
          String(attemptSummary.status || "unknown"),
          String(attemptSummary.error || ""),
        )
        const shouldRetry =
          !attemptSummary.candidate_detected && attempt < retries && (retryOn.has("any") || retryOn.has(retryTag))
        ;(attemptSummary as any).retry_tag = retryTag
        ;(attemptSummary as any).will_retry = shouldRetry
        attemptSummaries.push(attemptSummary)
        finalParsed = parsed

        if (!shouldRetry) break
        const sleepMs = computeSleepMs(cooldownMs, jitterMs)
        if (sleepMs > 0) await sleep(sleepMs)
      }

      const summary = {
        mode,
        status: finalParsed.status || "unknown",
        steps: finalParsed.steps || steps.length,
        retries_requested: retries,
        retry_on: Array.from(retryOn),
        cooldown_ms: cooldownMs,
        jitter_ms: jitterMs,
        attempts_ran: attemptSummaries.length,
        pattern_hits: finalParsed.pattern_hits || [],
        flag_candidates: collectFlagCandidates(
          [
            String(finalParsed.tail || ""),
            ...(Array.isArray(finalParsed.transcript)
              ? finalParsed.transcript.map((item: any) => String(item?.data || ""))
              : []),
            finalOutput,
          ].join("\n"),
          args.flagPattern,
        ),
        oracle_verified: false,
        candidate_detected: false,
        eof: finalParsed.status === "eof",
        error: finalParsed.error || "",
        prompt_hint: detectPromptHint(String(finalParsed.tail || finalOutput)),
        last_transcript_event:
          Array.isArray(finalParsed.transcript) && finalParsed.transcript.length
            ? finalParsed.transcript[finalParsed.transcript.length - 1]
            : null,
        attempts: attemptSummaries,
      }
      summary.candidate_detected = summary.flag_candidates.length > 0
      ;(summary as any).flag_detected = summary.candidate_detected
      ;(summary as any).flag_detected_is_candidate_only = true
      if (args.jsonOnly) return JSON.stringify({ pwn_expect_runner: summary, detail: finalParsed }, null, 2)
      return [
        "pwn_expect_runner:",
        `- mode: ${mode}`,
        `- status: ${summary.status}`,
        `- steps: ${summary.steps}`,
        `- retries_requested: ${summary.retries_requested}`,
        `- retry_on: ${summary.retry_on.join(" | ") || "none"}`,
        `- cooldown_ms: ${summary.cooldown_ms}`,
        `- jitter_ms: ${summary.jitter_ms}`,
        `- attempts_ran: ${summary.attempts_ran}`,
        `- candidate_detected: ${summary.candidate_detected}`,
        `- flag_detected_is_candidate_only: true`,
        `- oracle_verified: ${summary.oracle_verified}`,
        `- flag_candidates: ${summary.flag_candidates.length ? summary.flag_candidates.map((x: any) => x.value).join(" | ") : "none"}`,
        `- eof: ${summary.eof}`,
        `- error: ${summary.error}`,
        `- prompt_hint: ${summary.prompt_hint || "none"}`,
        `- last_transcript_event: ${summary.last_transcript_event ? JSON.stringify(summary.last_transcript_event) : "none"}`,
        `- attempt_statuses: ${attemptSummaries.map((item) => `#${item.attempt}:${item.status}/${item.retry_tag}${item.will_retry ? "->retry" : ""}`).join(" | ") || "none"}`,
        "tail_compact:",
        compact(String(finalParsed.tail || finalOutput), 6000),
      ].join("\n")
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  },
})
