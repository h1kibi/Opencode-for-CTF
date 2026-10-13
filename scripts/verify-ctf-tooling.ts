import { spawnSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

type Check = {
  name: string
  command: string
  args?: string[]
  localWindows?: Array<{
    command: string
    args?: string[]
    pathOnly?: boolean
    label?: string
  }>
  group: "web" | "crypto" | "pwn" | "rev" | "forensics" | "misc" | "optional"
  required?: boolean
}

function winTool(...segments: string[]): string | undefined {
  if (process.platform !== "win32") return undefined
  return join("C:\\Tools", ...segments)
}

function localCommand(command: string | undefined, args?: string[], label?: string) {
  if (!command) return undefined
  return { command, args, label }
}

function localPath(command: string | undefined, label?: string) {
  if (!command) return undefined
  return { command, pathOnly: true, label }
}

function pythonScript(script: string | undefined, args?: string[]) {
  if (!script || !existsSync(script)) return undefined
  return { command: "python", args: [script, ...(args ?? [])], label: script }
}

const checks: Check[] = [
  { group: "web", name: "curl", command: "curl", args: ["--version"] },
  { group: "web", name: "jq", command: "jq", args: ["--version"] },
  { group: "web", name: "python3", command: "python3", args: ["--version"] },
  { group: "web", name: "node", command: "node", args: ["--version"] },
  {
    group: "web",
    name: "nuclei",
    command: "nuclei",
    args: ["-version"],
    localWindows: [localPath(winTool("nuclei", "nuclei.exe"), "C:\\Tools\\nuclei\\nuclei.exe")].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  {
    group: "web",
    name: "ffuf",
    command: "ffuf",
    args: ["-V"],
    localWindows: [localCommand(winTool("ffuf", "ffuf.exe"), ["-V"])].filter(Boolean) as Check["localWindows"],
  },
  {
    group: "web",
    name: "feroxbuster",
    command: "feroxbuster",
    args: ["--version"],
    localWindows: [localCommand(winTool("feroxbuster", "feroxbuster.exe"), ["--version"])].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  {
    group: "web",
    name: "dirsearch",
    command: "dirsearch",
    args: ["--version"],
    localWindows: [pythonScript(winTool("dirsearch", "dirsearch.py"), ["--version"])].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  {
    group: "web",
    name: "sqlmap",
    command: "sqlmap",
    args: ["--version"],
    localWindows: [pythonScript(winTool("sqlmap", "sqlmap.py"), ["--version"])].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  {
    group: "web",
    name: "nmap",
    command: "nmap",
    args: ["--version"],
    localWindows: [localCommand(winTool("nmap", "nmap.exe"), ["--version"])].filter(Boolean) as Check["localWindows"],
  },
  {
    group: "web",
    name: "whatweb",
    command: "whatweb",
    args: ["--version"],
    localWindows: [localPath(winTool("whatweb", "whatweb"), "C:\\Tools\\whatweb\\whatweb")].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  { group: "crypto", name: "openssl", command: "openssl", args: ["version"] },
  { group: "crypto", name: "sage", command: "sage", args: ["--version"] },
  {
    group: "crypto",
    name: "hashcat",
    command: "hashcat",
    args: ["--version"],
    localWindows: [localCommand(winTool("hashcat-7.1.2", "hashcat.exe"), ["--version"])].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  { group: "pwn", name: "gdb", command: "gdb", args: ["--version"] },
  { group: "pwn", name: "checksec", command: "checksec", args: ["--help"] },
  { group: "pwn", name: "readelf", command: "readelf", args: ["--version"] },
  { group: "pwn", name: "objdump", command: "objdump", args: ["--version"] },
  { group: "pwn", name: "nm", command: "nm", args: ["--version"] },
  { group: "pwn", name: "strings", command: "strings", args: ["--version"] },
  {
    group: "pwn",
    name: "radare2",
    command: "r2",
    args: ["-v"],
    localWindows: [
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "r2.bat"), ["-v"]),
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "radare2.exe"), ["-v"]),
    ].filter(Boolean) as Check["localWindows"],
  },
  { group: "rev", name: "file", command: "file", args: ["--version"] },
  {
    group: "rev",
    name: "dnspy",
    command: "__opencode_ctf_dnspy_path_only__",
    args: ["--version"],
    localWindows: [localPath(winTool("dnSpy", "dnSpy.exe"), "C:\\Tools\\dnSpy\\dnSpy.exe")].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  { group: "forensics", name: "tshark", command: "tshark", args: ["--version"] },
  {
    group: "forensics",
    name: "exiftool",
    command: "exiftool",
    args: ["-ver"],
    localWindows: [localCommand(winTool("exiftool", "exiftool.exe"), ["-ver"])].filter(
      Boolean,
    ) as Check["localWindows"],
  },
  // Misc baseline: Python is the only hard prerequisite; route-specific tools
  // are reported as recommended/optional so a missing Sage/ffmpeg/SDR stack
  // does not make ordinary encoding or scripting challenges look unavailable.
  { group: "misc", name: "python", command: "python", args: ["--version"], required: true },
  { group: "misc", name: "pwntools", command: "python", args: ["-c", "import pwn"], required: false },
  { group: "misc", name: "z3", command: "python", args: ["-c", "import z3"], required: false },
  { group: "misc", name: "Pillow", command: "python", args: ["-c", "import PIL"], required: false },
  { group: "misc", name: "numpy", command: "python", args: ["-c", "import numpy"], required: false },
  { group: "misc", name: "dnspython", command: "python", args: ["-c", "import dns"], required: false },
  { group: "misc", name: "ffmpeg", command: "ffmpeg", args: ["-version"] },
  { group: "misc", name: "zbarimg", command: "zbarimg", args: ["--version"] },
  { group: "misc", name: "zsteg", command: "zsteg", args: ["--version"] },
  { group: "misc", name: "exiftool", command: "exiftool", args: ["-ver"] },
  { group: "misc", name: "tshark", command: "tshark", args: ["--version"] },
  { group: "misc", name: "sage", command: "sage", args: ["--version"] },
  { group: "misc", name: "gcc", command: "gcc", args: ["--version"] },
]

function exists(check: Check): boolean {
  const res = spawnSync(check.command, check.args ?? [], {
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  if (res.status === 0) return true
  for (const local of check.localWindows ?? []) {
    if (local.pathOnly) {
      if (existsSync(local.command)) return true
      continue
    }
    const localRes = spawnSync(local.command, local.args ?? [], {
      stdio: "ignore",
      shell: process.platform === "win32" && /\.(bat|cmd)$/i.test(local.command),
    })
    if (localRes.status === 0) return true
  }
  return false
}

const groups = new Map<string, { found: string[]; missing: string[]; requiredMissing: string[] }>()

for (const check of checks) {
  const bucket = groups.get(check.group) ?? { found: [], missing: [], requiredMissing: [] }
  if (exists(check)) bucket.found.push(check.name)
  else {
    bucket.missing.push(check.name)
    if (check.required) bucket.requiredMissing.push(check.name)
  }
  groups.set(check.group, bucket)
}

for (const [group, result] of groups) {
  console.log(`\n## ${group}`)
  console.log(`found: ${result.found.length ? result.found.join(", ") : "none"}`)
  console.log(`missing: ${result.missing.length ? result.missing.join(", ") : "none"}`)
  if (result.requiredMissing.length) console.log(`required missing: ${result.requiredMissing.join(", ")}`)
}

console.log(
  "\nUse missing tools only when the selected challenge path requires them. Prefer route-specific installs over broad toolset expansion during active solving.",
)
