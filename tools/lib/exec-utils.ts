/**
 * Shared execution utilities for CTF tooling.
 *
 * Consolidates safeExec / safeExecDocker / isFailureOutput patterns that were
 * previously duplicated across 16+ tool files.
 */

import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import { access } from "node:fs/promises"
import path from "node:path"

const execFile = promisify(execFileCb)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SafeExecResult = {
  output: string
  ok: boolean
  exitCode: number | null
}

/** Options for safeExecWithStreams and enhanced safeExec calls. */
export interface SafeExecOptions {
  cwd?: string
  timeoutMs?: number
  maxBuffer?: number
  shell?: boolean
  env?: NodeJS.ProcessEnv
}

/** Result that preserves separate stdout/stderr streams. */
export type SafeExecStreamResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  ok: boolean
}

// ---------------------------------------------------------------------------
// Windows helper — resolves .cmd wrappers for ELF-analysis commands
// ---------------------------------------------------------------------------

const WINDOWS_WRAPPERS: Record<string, string[]> = {
  file: ["file.cmd"],
  checksec: ["checksec.cmd"],
  readelf: ["readelf.cmd"],
  nm: ["nm.cmd"],
  objdump: ["objdump.cmd"],
  strings: ["strings.cmd"],
  gdb: ["gdb.cmd"],
  capinfos: ["capinfos.cmd"],
  tshark: ["tshark.cmd"],
  exiftool: ["exiftool.cmd"],
  binwalk: ["binwalk.cmd"],
  zsteg: ["zsteg.cmd"],
  ROPgadget: ["ROPgadget.cmd"],
  one_gadget: ["one_gadget.cmd"],
}

async function resolveExec(cmd: string): Promise<string> {
  if (process.platform !== "win32") return cmd
  const userBin = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), "bin")
  const wrapperNames = WINDOWS_WRAPPERS[cmd] ?? []
  for (const wrapper of wrapperNames) {
    const candidate = path.join(userBin, wrapper)
    try {
      await access(candidate)
      return candidate
    } catch {
      // fall through
    }
  }
  return cmd
}

// ---------------------------------------------------------------------------
// safeExec — run a command and return structured result
// ---------------------------------------------------------------------------

/** The promisified child_process.execFile — shared instance for callers that need raw access. */
export { execFile }

/**
 * Execute a command safely, returning a structured result with `output`,
 * `ok` (true when exit code is 0), and `exitCode`.
 *
 * Never throws — errors are captured in the result.
 *
 * Overloaded signature: pass positional params OR a single SafeExecOptions object.
 */
export async function safeExec(
  cmd: string,
  args: string[],
  cwd?: string,
  timeoutMs?: number,
  maxBuffer?: number,
): Promise<SafeExecResult>

export async function safeExec(cmd: string, args: string[], options?: SafeExecOptions): Promise<SafeExecResult>

export async function safeExec(
  cmd: string,
  args: string[],
  cwdOrOpts?: string | SafeExecOptions,
  timeoutMs = 6000,
  maxBuffer = 1024 * 1024,
): Promise<SafeExecResult> {
  // Normalise arguments: object-style or positional?
  let cwd: string
  let shell = false
  let env: NodeJS.ProcessEnv | undefined
  if (typeof cwdOrOpts === "object" && cwdOrOpts !== null) {
    cwd = cwdOrOpts.cwd ?? process.cwd()
    timeoutMs = cwdOrOpts.timeoutMs ?? 6000
    maxBuffer = cwdOrOpts.maxBuffer ?? 1024 * 1024
    shell = cwdOrOpts.shell ?? false
    env = cwdOrOpts.env
  } else {
    cwd = cwdOrOpts ?? process.cwd()
  }

  try {
    const resolved = shell ? cmd : await resolveExec(cmd)
    const { stdout, stderr } = await execFile(resolved, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer,
      shell,
      env,
    })
    const output = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    return { output: output || "<no output>", ok: true, exitCode: 0 }
  } catch (err: unknown) {
    const e = err as {
      stdout?: string
      stderr?: string
      message?: string
      code?: string
    }
    const out = `${e.stdout ?? ""}${e.stderr ? `\n[stderr]\n${e.stderr}` : ""}`.trim()
    const fallback = out || `<failed: ${e.message ?? String(err)}>`
    // Extract exit code from the error if available
    const exitCode = (err as { code?: string | number }).code ?? null
    return {
      output: fallback,
      ok: false,
      exitCode: typeof exitCode === "number" ? exitCode : null,
    }
  }
}

// ---------------------------------------------------------------------------
// safeExecWithStreams — like safeExec but preserves stdout/stderr separately
// ---------------------------------------------------------------------------

/**
 * Execute a command and return separate stdout/stderr streams.
 *
 * Use this over safeExec when callers need to inspect stdout and stderr
 * independently (e.g. user-facing output, classification).
 */
export async function safeExecWithStreams(
  cmd: string,
  args: string[],
  options?: SafeExecOptions,
): Promise<SafeExecStreamResult> {
  const cwd = options?.cwd ?? process.cwd()
  const timeoutMs = options?.timeoutMs ?? 6000
  const maxBuffer = options?.maxBuffer ?? 1024 * 1024
  const shell = options?.shell ?? false
  const env = options?.env

  try {
    const resolved = shell ? cmd : await resolveExec(cmd)
    const { stdout, stderr } = await execFile(resolved, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer,
      shell,
      env,
    })
    return { stdout, stderr, exitCode: 0, ok: true }
  } catch (err: unknown) {
    const e = err as {
      stdout?: string
      stderr?: string
      message?: string
      code?: string | number
    }
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "",
      exitCode: typeof e.code === "number" ? e.code : null,
      ok: false,
    }
  }
}

// ---------------------------------------------------------------------------
// safeExecDocker — run a shell command inside a CTF Docker container
// ---------------------------------------------------------------------------

/**
 * Run a command inside a Docker container for CTF tooling.
 *
 * The target file is mounted into the container at /work/ and the command
 * can reference it via __TARGET__.
 *
 * Returns the same signature as safeExec.
 */
export async function safeExecDocker(
  workspaceRoot: string,
  workspaceFile: string,
  image: string,
  shellCommand: string,
  timeoutMs = 30000,
): Promise<SafeExecResult> {
  const containerWorkdir = "/work"
  const mountedRoot = workspaceRoot.replace(/\\/g, "/")
  const rel = path.relative(workspaceRoot, workspaceFile).replace(/\\/g, "/")
  const targetInContainer = `${containerWorkdir}/${rel}`
  const command = shellCommand.replaceAll("__TARGET__", targetInContainer)
  return safeExec(
    "docker",
    ["run", "--rm", "-v", `${mountedRoot}:${containerWorkdir}`, "-w", containerWorkdir, image, "bash", "-lc", command],
    workspaceRoot,
    timeoutMs,
    2 * 1024 * 1024,
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a safeExec output string indicates failure. */
export function isFailureOutput(text: string): boolean {
  return /^<failed:/i.test(text.trim())
}

/** Shell-quote a string for safe interpolation in shell commands. */
export function shellQuote(value: string): string {
  return JSON.stringify(value)
}

/**
 * Quote a value for use in Docker shell commands.
 * Simpler than shellQuote; wraps in single quotes and escapes internal quotes.
 */
export function dockerQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
