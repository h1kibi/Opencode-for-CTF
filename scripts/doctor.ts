import { spawnSync } from "child_process"

type CheckGroup = "core" | "web" | "pwn" | "rev" | "forensics" | "crypto"

type Check = {
  group: CheckGroup
  name: string
  command: string
  args: string[]
}

const checks: Check[] = [
  { group: "core", name: "node", command: "node", args: ["--version"] },
  { group: "core", name: "python", command: "python", args: ["--version"] },
  { group: "core", name: "git", command: "git", args: ["--version"] },
  { group: "web", name: "curl", command: "curl", args: ["--version"] },
  { group: "web", name: "docker", command: "docker", args: ["--version"] },
  { group: "web", name: "ffuf", command: "ffuf", args: ["-V"] },
  { group: "pwn", name: "gdb", command: "gdb", args: ["--version"] },
  { group: "pwn", name: "checksec", command: "checksec", args: ["--version"] },
  { group: "rev", name: "file", command: "file", args: ["--version"] },
  { group: "rev", name: "jadx", command: "jadx", args: ["--version"] },
  { group: "forensics", name: "tshark", command: "tshark", args: ["--version"] },
  { group: "forensics", name: "exiftool", command: "exiftool", args: ["-ver"] },
  { group: "forensics", name: "ida-pro-mcp", command: "ida-pro-mcp", args: ["--help"] },
  { group: "crypto", name: "openssl", command: "openssl", args: ["version"] },
  { group: "crypto", name: "sage", command: "sage", args: ["--version"] },
]

function exists(check: Check): boolean {
  const result = spawnSync(check.command, check.args, {
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  return result.status === 0
}

const order: CheckGroup[] = ["core", "web", "pwn", "rev", "forensics", "crypto"]
const grouped = new Map<CheckGroup, { found: string[]; missing: string[] }>()

for (const check of checks) {
  const bucket = grouped.get(check.group) ?? { found: [], missing: [] }
  if (exists(check)) bucket.found.push(check.name)
  else bucket.missing.push(check.name)
  grouped.set(check.group, bucket)
}

console.log("# CTF Doctor")
console.log("\nThis script checks the smallest useful toolchain for each challenge family.")

for (const group of order) {
  const bucket = grouped.get(group) ?? { found: [], missing: [] }
  console.log(`\n## ${group}`)
  console.log(`found: ${bucket.found.length ? bucket.found.join(", ") : "none"}`)
  console.log(`missing: ${bucket.missing.length ? bucket.missing.join(", ") : "none"}`)
}

console.log("\nUse missing tools only when the selected challenge path requires them.")
console.log(`WireMCP launcher: ${process.env.WIREMCP_LAUNCHER ? "configured" : "not configured (set WIREMCP_LAUNCHER for wireshark-mcp)"}`)
console.log("IDA MCP backend: install mrexodia/ida-pro-mcp so `ida-pro-mcp --stdio` is available for the ida-pro slot.")
