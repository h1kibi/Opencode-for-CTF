import { spawnSync } from "child_process"

type Item = {
  name: string
  command: string
  args: string[]
}

const checks: Item[] = [
  { name: "python", command: "python", args: ["--version"] },
  { name: "file", command: "file", args: ["--version"] },
  { name: "strings", command: "strings", args: ["--version"] },
  { name: "objdump", command: "objdump", args: ["--version"] },
  { name: "readelf", command: "readelf", args: ["--version"] },
  { name: "nm", command: "nm", args: ["--version"] },
  { name: "gdb", command: "gdb", args: ["--version"] },
  { name: "apktool", command: "apktool", args: ["--version"] },
  { name: "adb", command: "adb", args: ["version"] },
  { name: "jadx", command: "jadx", args: ["--version"] },
  { name: "aapt", command: "aapt", args: ["version"] },
  { name: "aapt2", command: "aapt2", args: ["version"] },
  { name: "apkanalyzer", command: "apkanalyzer", args: ["--help"] },
  { name: "baksmali", command: "baksmali", args: ["--version"] },
  { name: "apkid", command: "apkid", args: ["--version"] },
  { name: "frida", command: "frida", args: ["--version"] },
  { name: "frida-ps", command: "frida-ps", args: ["--version"] },
  { name: "java", command: "java", args: ["-version"] },
  { name: "javap", command: "javap", args: ["-version"] },
  { name: "rizin", command: "rizin", args: ["-v"] },
  { name: "rz-bin", command: "rz-bin", args: ["-v"] },
  { name: "ghidraRun", command: "ghidraRun", args: [] },
  { name: "analyzeHeadless", command: "analyzeHeadless", args: ["/?"] },
  { name: "mcp-reva", command: "mcp-reva", args: ["--version"] },
  { name: "ida-pro-mcp", command: "ida-pro-mcp", args: ["--help"] },
  { name: "idalib-mcp", command: "idalib-mcp", args: ["--help"] },
]

function exists(check: Item): boolean {
  const result = spawnSync(check.command, check.args, {
    stdio: "ignore",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      IDADIR: "C:\\Tools\\ida92\\portable",
      IDA_PATH: "C:\\Tools\\ida92\\portable",
    },
  })
  return result.status === 0
}

const found: string[] = []
const missing: string[] = []
for (const check of checks) {
  if (exists(check)) found.push(check.name)
  else missing.push(check.name)
}

console.log("# REV Doctor")
console.log(`found: ${found.length ? found.join(", ") : "none"}`)
console.log(`missing: ${missing.length ? missing.join(", ") : "none"}`)
console.log("ida_dir: C:\\Tools\\ida92\\portable")
