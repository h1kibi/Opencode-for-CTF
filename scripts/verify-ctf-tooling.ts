import { spawnSync } from "child_process"

type Check = {
  name: string
  command: string
  args?: string[]
  group: "web" | "crypto" | "pwn" | "rev" | "forensics" | "optional"
}

const checks: Check[] = [
  { group: "web", name: "curl", command: "curl", args: ["--version"] },
  { group: "web", name: "jq", command: "jq", args: ["--version"] },
  { group: "web", name: "python3", command: "python3", args: ["--version"] },
  { group: "web", name: "node", command: "node", args: ["--version"] },
  { group: "web", name: "ffuf", command: "ffuf", args: ["-V"] },
  { group: "web", name: "sqlmap", command: "sqlmap", args: ["--version"] },
  { group: "crypto", name: "openssl", command: "openssl", args: ["version"] },
  { group: "crypto", name: "sage", command: "sage", args: ["--version"] },
  { group: "pwn", name: "gdb", command: "gdb", args: ["--version"] },
  { group: "pwn", name: "checksec", command: "checksec", args: ["--version"] },
  { group: "pwn", name: "readelf", command: "readelf", args: ["--version"] },
  { group: "pwn", name: "objdump", command: "objdump", args: ["--version"] },
  { group: "pwn", name: "nm", command: "nm", args: ["--version"] },
  { group: "pwn", name: "strings", command: "strings", args: ["--version"] },
  { group: "rev", name: "file", command: "file", args: ["--version"] },
  { group: "forensics", name: "exiftool", command: "exiftool", args: ["-ver"] },
]

function exists(check: Check): boolean {
  const res = spawnSync(check.command, check.args ?? [], {
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  return res.status === 0
}

const groups = new Map<string, { found: string[]; missing: string[] }>()

for (const check of checks) {
  const bucket = groups.get(check.group) ?? { found: [], missing: [] }
  if (exists(check)) bucket.found.push(check.name)
  else bucket.missing.push(check.name)
  groups.set(check.group, bucket)
}

for (const [group, result] of groups) {
  console.log(`\n## ${group}`)
  console.log(`found: ${result.found.length ? result.found.join(", ") : "none"}`)
  console.log(`missing: ${result.missing.length ? result.missing.join(", ") : "none"}`)
}

console.log(
  "\nUse missing tools only when the selected challenge path requires them. Prefer route-specific installs over broad toolset expansion during active solving.",
)
