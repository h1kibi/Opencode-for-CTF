import { safeExec } from "./exec-utils.ts"

/** A resolved Python interpreter plus any launcher-specific leading args. */
export type PythonLauncher = {
  cmd: string
  baseArgs: string[]
}

type Candidate = {
  cmd: string
  probeArgs: string[]
  baseArgs: string[]
}

// Windows environments may expose `py`/`python` instead of `python3`; POSIX
// images frequently ship `python3` only, so the order is platform-specific.
const CANDIDATES: Candidate[] =
  process.platform === "win32"
    ? [
        { cmd: "python", probeArgs: ["--version"], baseArgs: [] },
        { cmd: "py", probeArgs: ["-3", "--version"], baseArgs: ["-3"] },
        { cmd: "python3", probeArgs: ["--version"], baseArgs: [] },
      ]
    : [
        { cmd: "python3", probeArgs: ["--version"], baseArgs: [] },
        { cmd: "python", probeArgs: ["--version"], baseArgs: [] },
      ]

/**
 * Resolve the first working Python launcher for this host.
 *
 * CTF tools must not assume `python` exists: Linux/WSL images commonly provide
 * only `python3`, while Windows may provide only `py`. Callers pass `baseArgs`
 * before their script path (e.g. `py -3 script.py`).
 */
export async function resolvePythonLauncher(): Promise<PythonLauncher> {
  for (const candidate of CANDIDATES) {
    const probe = await safeExec(candidate.cmd, candidate.probeArgs, {
      timeoutMs: 4000,
      maxBuffer: 256 * 1024,
      shell: process.platform === "win32",
    })
    if (probe.ok) return { cmd: candidate.cmd, baseArgs: candidate.baseArgs }
  }
  throw new Error("No working Python launcher found (tried python3, python, py -3).")
}
