import { spawnSync } from "child_process"
import { resolve } from "path"

function runNodeScript(script: string, args: string[]) {
  const res = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    shell: false,
  })
  return res.status ?? 1
}

const mode = process.argv[2]
const target = process.argv[3]

if (!mode) {
  console.log("Usage: node scripts/ctf-benchmark.ts <web|pwn|tooling> [target]")
  process.exit(1)
}

const root = resolve(__dirname)

if (mode === "web") {
  if (!target) {
    console.log("Usage: node scripts/ctf-benchmark.ts web <target>")
    process.exit(1)
  }
  const smoke = runNodeScript(resolve(root, "web-smoke-check.ts"), [])
  if (smoke !== 0) process.exit(smoke)
  process.exit(runNodeScript(resolve(root, "check-web-benchmarks.ts"), [target]))
}

if (mode === "pwn") {
  if (!target) {
    console.log("Usage: node scripts/ctf-benchmark.ts pwn <target>")
    process.exit(1)
  }
  const smoke = runNodeScript(resolve(root, "pwn-smoke-check.ts"), [])
  if (smoke !== 0) process.exit(smoke)
  process.exit(runNodeScript(resolve(root, "check-pwn-benchmarks.ts"), [target]))
}

if (mode === "tooling") {
  process.exit(runNodeScript(resolve(root, "verify-ctf-tooling.ts"), []))
}

console.log("Unknown mode. Use one of: web, pwn, tooling")
process.exit(1)
