import { safeExec } from "./exec-utils.ts"
import { existsSync } from "node:fs"
import path from "node:path"

export type EnvCheckItem = {
  name: string
  command: string
  args: string[]
  required: boolean
  category: string
  hint: string
  purpose?: string
  fallback?: string
}

/** How the check actually concluded:
 *  - ran:       command executed and returned (ok or failure exit)
 *  - located:   binary/shim found on disk without a runnable version probe
 *  - degraded:  present on this host but could not be probed here (spawn
 *               restrictions etc.) — NEVER count as missing
 *  - missing:   nothing found after alias expansion + root scan
 */
export type EnvProbeMode = "ran" | "located" | "degraded" | "missing"

export type EnvCheckResult = EnvCheckItem & {
  ok: boolean
  version: string
  probed: EnvProbeMode
  detail?: string
}

export function firstLine(s: string) {
  return (s.split(/\r?\n/).find(Boolean) || "<no output>").slice(0, 220)
}

// ---------------------------------------------------------------------------
// Command aliasing — tools known by several names on different hosts
// ---------------------------------------------------------------------------

export const COMMAND_ALIASES: Record<string, string[]> = {
  nc: ["nc", "ncat", "netcat"],
  netcat: ["nc", "ncat", "netcat"],
  python3: ["python3", "python"],
  python: ["python", "python3"],
  r2: ["r2", "radare2", "rizin"],
  radare2: ["radare2", "r2", "rizin"],
  rizin: ["rizin", "r2", "radare2"],
  tshark: ["tshark", "wireshark-tshark"],
  file: ["file"],
}

function aliasesFor(name: string): string[] {
  const canonical = COMMAND_ALIASES[name.toLowerCase()]
  if (canonical) return canonical
  return [name]
}

// ---------------------------------------------------------------------------
// Extra lookup roots beyond PATH (Windows conventions used by this setup)
// ---------------------------------------------------------------------------

function extraRoots(): string[] {
  if (process.platform !== "win32") return []
  const home = process.env.USERPROFILE || process.env.HOME || ""
  const roots = ["C:\\Tools\\ctf-bin", home ? path.join(home, "bin") : "", "C:\\Tools\\Wireshark"]
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (sdk) roots.push(path.join(sdk, "platform-tools"))
  roots.push("C:\\Tools\\android\\android-sdk\\platform-tools")
  return roots.filter((root) => root && existsSync(root))
}

async function whereAll(name: string): Promise<string[]> {
  // POSIX has no where.exe; `which` is the equivalent PATH lookup and keeps
  // runEnvChecks/resolveCommand from reporting every installed tool as missing
  // on Linux/WSL/macOS.
  const locator = process.platform === "win32" ? "where.exe" : "which"
  const r = await safeExec(locator, [name], undefined, 5000)
  if (!r.ok) return []
  return r.output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/**
 * Resolve a command across aliases. Returns the first hit as an absolute
 * path (PATH via `where`, then shim/tool roots), preferring real executables
 * but explicitly accepting .cmd/.bat shims.
 */
export async function resolveCommand(
  name: string,
): Promise<{ resolved?: string; matchedName?: string; source?: string }> {
  for (const candidate of aliasesFor(name)) {
    // 1) PATH lookup via where.exe (finds .exe/.cmd/.bat in one shot)
    const hits = await whereAll(candidate)
    for (const hit of hits) {
      if (existsSync(hit)) return { resolved: hit, matchedName: candidate, source: "PATH" }
    }
    // 2) shim / tool-root lookup
    for (const root of extraRoots()) {
      for (const ext of [".cmd", ".bat", ".exe"]) {
        const p = path.join(root, `${candidate}${ext}`)
        if (existsSync(p)) return { resolved: p, matchedName: candidate, source: root }
      }
      const bare = path.join(root, candidate)
      if (existsSync(bare)) return { resolved: bare, matchedName: candidate, source: root }
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Python interpreter resolution — the machine may have several pythons;
// import-based checks must find the one that actually has the modules.
// ---------------------------------------------------------------------------

type PythonProbeResult = { ok: boolean; output: string; interpreter?: string }

let pythonCandidatesPromise: Promise<string[]> | undefined

async function resolvePythonCandidates(): Promise<string[]> {
  const out: string[] = []
  if (process.env.CTF_PYTHON && existsSync(process.env.CTF_PYTHON)) out.push(process.env.CTF_PYTHON)
  const whereHits = await whereAll("python")
  out.push(...whereHits.filter((p) => existsSync(p)))
  if (process.platform === "win32") {
    for (const fallback of [
      "C:\\Projects\\python\\python.exe",
      "C:\\Python313\\python.exe",
      "C:\\Python312\\python.exe",
    ]) {
      if (existsSync(fallback)) out.push(fallback)
    }
  } else {
    for (const fallback of ["/usr/bin/python3", "/usr/bin/python"]) {
      if (existsSync(fallback)) out.push(fallback)
    }
  }
  return [...new Set(out)]
}

function pythonCandidates(): Promise<string[]> {
  pythonCandidatesPromise ??= resolvePythonCandidates()
  return pythonCandidatesPromise
}

// The misc env check probes 17 module checks in parallel; without a cap each
// missing module walks every interpreter at once and Windows spawns dozens of
// short-lived processes. Four concurrent probes keep latency low without the
// thundering herd.
const MAX_CONCURRENT_PYTHON_PROBES = 4
let activePythonProbes = 0
const pythonProbeWaiters: Array<() => void> = []

async function acquirePythonProbeSlot(): Promise<void> {
  if (activePythonProbes < MAX_CONCURRENT_PYTHON_PROBES) {
    activePythonProbes += 1
    return
  }
  await new Promise<void>((resolve) => pythonProbeWaiters.push(resolve))
}

function releasePythonProbeSlot(): void {
  const next = pythonProbeWaiters.shift()
  if (next) {
    next()
    return
  }
  activePythonProbes -= 1
}

async function runPythonProbe(code: string, timeoutMs: number): Promise<PythonProbeResult> {
  const candidates = await pythonCandidates()
  let last: PythonProbeResult = { ok: false, output: "no python interpreter found on this host" }
  for (const py of candidates) {
    const useShell = process.platform === "win32" && !py.toLowerCase().endsWith(".exe")
    const r = await safeExec(py, ["-c", code], { timeoutMs, shell: useShell })
    if (r.ok) return { ok: true, output: (r.output || "").trim(), interpreter: py }
    last = { ok: false, output: (r.output || "").trim() || `${py} exited non-zero` }
  }
  return last
}

const pythonProbeInFlight = new Map<string, Promise<PythonProbeResult>>()

/**
 * Run `python -c <code>` trying every known interpreter until one succeeds.
 * Identical concurrent probes share one run (the misc check probes PIL/numpy
 * twice), and interpreter spawns are capped by the slot semaphore.
 */
export function probePythonCode(code: string, timeoutMs = 8000): Promise<PythonProbeResult> {
  const key = `${timeoutMs}\u0000${code}`
  const existing = pythonProbeInFlight.get(key)
  if (existing) return existing
  const pending = (async () => {
    await acquirePythonProbeSlot()
    try {
      return await runPythonProbe(code, timeoutMs)
    } finally {
      releasePythonProbeSlot()
    }
  })().finally(() => {
    pythonProbeInFlight.delete(key)
  })
  pythonProbeInFlight.set(key, pending)
  return pending
}

// ---------------------------------------------------------------------------
// Safe execution with Windows shim support (EINVAL resilience)
// ---------------------------------------------------------------------------

export async function execLocated(
  resolved: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; output: string; degraded: boolean }> {
  const isShim = /\.(cmd|bat)$/i.test(resolved)
  // .cmd/.bat require a shell on Windows; a bare spawn returns EINVAL.
  const direct = await safeExec(resolved, args, { timeoutMs, shell: isShim })
  if (direct.ok || (direct.exitCode !== null && direct.exitCode !== 0)) {
    return { ok: direct.ok, output: (direct.output || "").trim(), degraded: false }
  }
  if (!isShim && process.platform === "win32") {
    // EINVAL / spawn failures: one retry through cmd.exe.
    const retry = await safeExec("cmd.exe", ["/c", resolved, ...args], { timeoutMs })
    if (retry.ok) return { ok: true, output: (retry.output || "").trim(), degraded: false }
  }
  const errText = (direct.output || "").toLowerCase()
  const degraded = errText.includes("einval") || errText.includes("spawn") || direct.exitCode === null
  return { ok: false, output: (direct.output || "").trim(), degraded }
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

export async function runEnvChecks(checks: EnvCheckItem[], timeoutMs = 6000): Promise<EnvCheckResult[]> {
  const results: EnvCheckResult[] = []
  for (const check of checks) {
    const base = { ...check }

    // Python-interpreter checks: probe with the interpreter that has the module.
    if (check.command === "python" && check.args[0] === "-c") {
      const code = check.args[1] ?? ""
      const r = await probePythonCode(code, timeoutMs)
      results.push({
        ...base,
        ok: r.ok,
        version: firstLine(r.output),
        probed: r.ok ? "ran" : "missing",
        detail: r.interpreter ? `interpreter: ${r.interpreter}` : r.output,
      })
      continue
    }

    // Everything else: alias-aware resolution, then execute.
    const { resolved, matchedName, source } = await resolveCommand(check.command)
    if (!resolved) {
      results.push({
        ...base,
        ok: false,
        version: "not found",
        probed: "missing",
        detail: `no PATH/shim hit for ${check.command}${COMMAND_ALIASES[check.command.toLowerCase()] ? ` (aliases tried: ${aliasesFor(check.command).join(", ")})` : ""}`,
      })
      continue
    }

    const r = await execLocated(resolved, check.args, timeoutMs)
    if (r.ok) {
      results.push({
        ...base,
        ok: true,
        version: firstLine(r.output) || `${matchedName ?? check.command} present`,
        probed: "ran",
        detail: source ? `via ${resolved}` : undefined,
      })
      continue
    }

    // Present on disk but cannot be probed on this host — that is NOT missing.
    const present = existsSync(resolved)
    if (present && r.degraded) {
      results.push({
        ...base,
        ok: true, // treat as available with a caveat; version unknown
        version: `present (probe unavailable: ${firstLine(r.output) || "spawn failed"})`,
        probed: "degraded",
        detail: `located at ${resolved}; execution probe failed on this host`,
      })
      continue
    }

    results.push({
      ...base,
      ok: r.ok,
      version: firstLine(r.output) || "probe failed",
      probed: present ? "degraded" : "missing",
      detail: `resolved: ${resolved}`,
    })
  }
  return results
}

export function summarizeEnvChecks(results: EnvCheckResult[]) {
  const required = results.filter((x) => x.required)
  const missingRequired = required.filter((x) => !x.ok && x.probed === "missing")
  const missingOptional = results.filter((x) => !x.required && !x.ok && x.probed === "missing")
  return {
    ready: missingRequired.length === 0,
    required_ok: required.filter((x) => x.ok).length,
    required_total: required.length,
    required_missing: missingRequired.map((x) => x.name),
    optional_missing: missingOptional.map((x) => x.name),
    degraded: results.filter((x) => x.probed === "degraded").map((x) => x.name),
  }
}
