import { existsSync } from "node:fs"
import path from "node:path"
import {
  revRuntimeValueSha256,
  type RevRuntimeDoctor,
  type RevRuntimeDoctorCheck,
  type RevRuntimeDoctorRequirement,
} from "../../packages/ctf-core/src/rev-runtime-session.ts"
import { safeExec } from "./exec-utils.ts"

export type RevRuntimeDoctorOptions = {
  cwd?: string
  timeoutMs?: number
}

type DoctorFallback = {
  command: string
  args?: string[]
  shell?: boolean
}

type DoctorSpec = {
  id: string
  requirement: RevRuntimeDoctorRequirement
  command: string
  args: string[]
  probe?: "command" | "path"
  pathCandidates?: string[]
  fallbacks?: DoctorFallback[]
  okWhen?: RegExp
  timeoutMs?: number
}

type ProbeResult = {
  output: string
  ok: boolean
  exitCode: number | null
}

function win(...segments: string[]) {
  return process.platform === "win32" ? path.join(...segments) : undefined
}

function envPath(name: string, ...suffixes: string[]) {
  const value = process.env[name]
  if (!value) return []
  const normalized = suffixes.some((suffix) => value.toLowerCase().endsWith(suffix.toLowerCase()))
    ? [value]
    : suffixes.map((suffix) => path.join(value, suffix))
  return normalized
}

function uniquePaths(paths: Array<string | undefined>) {
  return [...new Set(paths.filter((value): value is string => Boolean(value)))]
}

function pathOnPath(name: string) {
  if (!process.env.PATH) return undefined
  return process.env.PATH.split(path.delimiter)
    .map((directory) => path.join(directory, name))
    .find((candidate) => existsSync(candidate))
}
/**
 * Node's execFile cannot directly launch Windows .cmd/.bat wrappers without
 * going through cmd.exe. Do not enable shell mode merely because a command is
 * extensionless: native executables such as python.exe, node.exe, docker.exe,
 * and MCP .exe servers must stay on the non-shell path.
 */
function needsWindowsShell(command: string) {
  if (process.platform !== "win32" || path.extname(command)) return false
  return Boolean(pathOnPath(`${command}.cmd`) || pathOnPath(`${command}.bat`))
}

const ghidraHeadlessCandidates = uniquePaths([
  pathOnPath("analyzeHeadless.bat"),
  pathOnPath("analyzeHeadless.cmd"),
  ...envPath(
    "GHIDRA_INSTALL_DIR",
    path.join("support", "analyzeHeadless.bat"),
    path.join("support", "analyzeHeadless.cmd"),
    path.join("support", "analyzeHeadless"),
  ),
  // Prefer the short Windows path for cmd.exe /c to avoid nested quotes.
  win("C:\\Progra~1", "ghidra_12.0.4_PUBLIC", "support", "analyzeHeadless.bat"),
  win("C:\\Program Files", "ghidra_12.0.4_PUBLIC", "support", "analyzeHeadless.bat"),
  win("C:\\Tools", "ghidra", "support", "analyzeHeadless.bat"),
])
const x64dbgCandidates = uniquePaths([
  ...envPath("X64DBG_PATH", "x64dbg.exe"),
  ...envPath("X64DBG_PATH", "x32dbg.exe"),
  win("C:\\Tools", "snapshot", "release", "x64", "x64dbg.exe"),
  win("C:\\Tools", "snapshot", "release", "x32", "x32dbg.exe"),
])

const mcpRevaFallbacks: DoctorFallback[] = [pathOnPath("mcp-reva.exe"), pathOnPath("mcp-reva.cmd")]
  .filter((command): command is string => Boolean(command))
  .map((command) => ({
    command,
    args: ["--version"],
    shell: /\.(bat|cmd)$/i.test(command),
  }))

const radare2Fallbacks: DoctorFallback[] = [
  {
    command: win("C:\\Tools", "radare2", "radare2-6.1.4-w64", "bin", "radare2.exe") ?? "",
    args: ["-v"],
  },
].filter((item) => item.command)

const ghidraFallbacks: DoctorFallback[] = ghidraHeadlessCandidates.map((command) =>
  process.platform === "win32" && /\.(bat|cmd)$/i.test(command)
    ? { command: "cmd.exe", args: ["/d", "/c", `${command} -h`] }
    : { command, args: ["-h"] },
)
const DOCTOR_SPECS: DoctorSpec[] = [
  { id: "node", requirement: "required", command: "node", args: ["--version"] },
  { id: "python", requirement: "optional", command: "python", args: ["--version"] },
  { id: "file", requirement: "optional", command: "file", args: ["--version"] },
  { id: "objdump", requirement: "optional", command: "objdump", args: ["--version"] },
  { id: "readelf", requirement: "optional", command: "readelf", args: ["--version"] },
  { id: "gdb", requirement: "optional", command: "gdb", args: ["--version"] },
  { id: "docker", requirement: "optional", command: "docker", args: ["version", "--format", "{{.Server.Version}}"] },
  { id: "wsl", requirement: "optional", command: "wsl", args: ["--status"] },
  { id: "adb-version", requirement: "optional", command: "adb", args: ["version"] },
  { id: "adb-devices", requirement: "optional", command: "adb", args: ["devices"] },
  { id: "qemu-x86_64", requirement: "optional", command: "qemu-x86_64", args: ["--version"] },
  { id: "qemu-aarch64", requirement: "optional", command: "qemu-aarch64", args: ["--version"] },
  {
    id: "python-unicorn",
    requirement: "optional",
    command: "python",
    args: ["-c", "import unicorn; print(unicorn.__version__)"],
  },
  {
    id: "python-qiling",
    requirement: "optional",
    command: "python",
    args: ["-c", "import qiling; print(getattr(qiling, '__version__', 'installed'))"],
  },

  // Static/decompiler tools. These probes never receive a challenge path.
  {
    id: "radare2",
    requirement: "optional",
    command: "r2",
    args: ["-v"],
    fallbacks: radare2Fallbacks,
  },
  { id: "rizin", requirement: "optional", command: "rizin", args: ["-v"] },
  {
    id: "ghidra-headless",
    requirement: "optional",
    command: "analyzeHeadless",
    args: ["-h"],
    fallbacks: ghidraFallbacks,
    okWhen: /Headless Analyzer Usage|^\s*Usage:/im,
    // Java startup is noticeably slower than ordinary CLI probes on Windows.
    timeoutMs: 10000,
  },
  { id: "frida", requirement: "optional", command: "frida", args: ["--version"] },
  { id: "apktool", requirement: "optional", command: "apktool", args: ["--version"] },
  {
    id: "mcp-reva",
    requirement: "optional",
    command: "mcp-reva",
    args: ["--version"],
    fallbacks: mcpRevaFallbacks,
    okWhen: /mcp-reva\s+\d/i,
  },

  // Debugger entries are deliberately capability labels, not claims of
  // headless automation. x64dbg/WinDbg GUI presence is path/version only.
  {
    id: "x64dbg-gui",
    requirement: "optional",
    command: "path-probe",
    args: [],
    probe: "path",
    pathCandidates: x64dbgCandidates,
  },
  { id: "cdb", requirement: "optional", command: "cdb", args: ["-?"], okWhen: /Microsoft|Debugger|Usage/i },
  {
    id: "windbgx",
    requirement: "optional",
    command: "WinDbgX",
    args: [],
    probe: "path",
    pathCandidates: uniquePaths([
      win(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps", "WinDbgX.exe"),
      win("C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WindowsApps", "WinDbgX.exe"),
    ]),
  },
]

function firstLine(output: string) {
  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 240) ?? null
  )
}

function classify(result: ProbeResult, okWhen?: RegExp) {
  const hasOutput = Boolean(result.output) && result.output !== "<no output>" && !/^<failed:/i.test(result.output)
  const accepted = hasOutput && (result.ok || Boolean(okWhen?.test(result.output)))
  return {
    accepted,
    status: accepted ? ("available" as const) : result.exitCode === null ? ("missing" as const) : ("error" as const),
  }
}

async function runCommand(spec: DoctorSpec, options: RevRuntimeDoctorOptions): Promise<ProbeResult> {
  const attempts = [
    { command: spec.command, args: spec.args, shell: needsWindowsShell(spec.command) },
    ...(spec.fallbacks ?? []),
  ]
  let last: ProbeResult = { output: "<failed: no probe candidates>", ok: false, exitCode: null }
  for (const attempt of attempts) {
    if (!attempt.command) continue
    last = await safeExec(attempt.command, attempt.args ?? [], {
      cwd: options.cwd,
      timeoutMs: Math.min(spec.timeoutMs ?? 3500, options.timeoutMs ?? 1500),
      maxBuffer: 256 * 1024,
      shell: attempt.shell ?? false,
    })
    if (classify(last, spec.okWhen).accepted) return last
  }
  return last
}

async function runCheck(spec: DoctorSpec, options: RevRuntimeDoctorOptions): Promise<RevRuntimeDoctorCheck> {
  if (spec.probe === "path") {
    const found = spec.pathCandidates?.find((candidate) => existsSync(candidate))
    const output = found ? `present: ${found}` : "<failed: path not found>"
    return {
      id: spec.id,
      requirement: spec.requirement,
      command: spec.command,
      args: [...spec.args],
      status: found ? "available" : "missing",
      version: found ? "present" : null,
      output_sha256: revRuntimeValueSha256(output),
      detail: found ?? "no configured candidate path exists",
    }
  }
  const result = await runCommand(spec, options)
  const { status } = classify(result, spec.okWhen)
  return {
    id: spec.id,
    requirement: spec.requirement,
    command: spec.command,
    args: [...spec.args],
    status,
    version: status === "available" ? firstLine(result.output) : null,
    output_sha256: result.output ? revRuntimeValueSha256(result.output) : null,
    detail: result.output.slice(0, 240),
  }
}

export async function runRevRuntimeDoctor(options: RevRuntimeDoctorOptions = {}): Promise<RevRuntimeDoctor> {
  const checks = await Promise.all(DOCTOR_SPECS.map((spec) => runCheck(spec, options)))
  const available = new Set(checks.filter((check) => check.status === "available").map((check) => check.id))
  const requiredFailures = checks.filter((check) => check.requirement === "required" && check.status !== "available")
  const optionalFailures = checks.filter((check) => check.requirement === "optional" && check.status !== "available")
  const issues = [
    ...requiredFailures.map((check) => `required capability check failed: ${check.id} (${check.status})`),
    ...optionalFailures.map((check) => `optional capability unavailable: ${check.id} (${check.status})`),
  ]
  const capabilities: string[] = []
  if (available.has("file") && available.has("objdump")) capabilities.push("native-static")
  if (available.has("file") && available.has("readelf") && available.has("objdump")) capabilities.push("elf-static")
  if (available.has("file") && available.has("objdump")) capabilities.push("pe-static")
  if (available.has("radare2")) capabilities.push("radare2")
  if (available.has("rizin")) capabilities.push("rizin")
  if (available.has("ghidra-headless")) capabilities.push("ghidra-headless")
  if (available.has("frida")) capabilities.push("frida")
  if (available.has("apktool")) capabilities.push("apktool")
  if (available.has("mcp-reva")) capabilities.push("reva-mcp")
  if (available.has("x64dbg-gui")) capabilities.push("x64dbg-gui")
  if (available.has("windbgx")) capabilities.push("windbgx-gui")
  if (available.has("docker")) capabilities.push("docker")
  if (available.has("python-unicorn")) capabilities.push("unicorn")
  if (available.has("python-qiling")) capabilities.push("qiling")
  if (available.has("qemu-x86_64")) capabilities.push("qemu-x86_64")
  if (available.has("qemu-aarch64")) capabilities.push("qemu-aarch64")
  if (available.has("adb-version") && available.has("adb-devices")) capabilities.push("adb")
  if (available.has("wsl")) capabilities.push("wsl")
  const status: RevRuntimeDoctor["status"] =
    requiredFailures.length > 0
      ? "fail"
      : checks.every((check) => check.status !== "available")
        ? "unavailable"
        : optionalFailures.length > 0
          ? "partial"
          : "pass"
  return {
    status,
    source: "ctf-rev-runtime-doctor",
    checked_at: new Date().toISOString(),
    checks,
    capabilities,
    issues,
  }
}

export const revRuntimeDoctorSpecs = DOCTOR_SPECS.map((spec) => ({
  ...spec,
  args: [...spec.args],
  pathCandidates: [...(spec.pathCandidates ?? [])],
  fallbacks: spec.fallbacks?.map((fallback) => ({ ...fallback, args: [...(fallback.args ?? [])] })),
}))
