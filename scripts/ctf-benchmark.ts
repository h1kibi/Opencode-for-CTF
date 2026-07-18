import { spawnSync } from "child_process"
import { resolve } from "path"
import { benchmarkFamilies } from "../packages/ctf-benchmark-core/src/index.ts"

function runNodeScript(script: string, args: string[]) {
  const res = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    shell: false,
  })
  return res.status ?? 1
}

const mode = process.argv[2]
const target = process.argv[3]

const familyNames = benchmarkFamilies.map((entry) => entry.family)

if (!mode) {
  console.log(`Usage: node scripts/ctf-benchmark.ts <${[...new Set([...familyNames, "tooling"])].join("|")}> [target]`)
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

if (mode === "crypto") {
  if (!target) {
    console.log("Usage: node scripts/ctf-benchmark.ts crypto <target>")
    process.exit(1)
  }
  process.exit(runNodeScript(resolve(root, "check-crypto-benchmarks.ts"), [target]))
}

if (mode === "rev") {
  if (!target) {
    console.log("Usage: node scripts/ctf-benchmark.ts rev <target>")
    process.exit(1)
  }
  process.exit(runNodeScript(resolve(root, "check-rev-benchmarks.ts"), [target]))
}

if (mode === "forensics") {
  if (!target) {
    console.log("Usage: node scripts/ctf-benchmark.ts forensics <target>")
    process.exit(1)
  }
  process.exit(runNodeScript(resolve(root, "check-forensics-benchmarks.ts"), [target]))
}

if (mode === "misc") {
  if (!target) {
    console.log("Usage: node scripts/ctf-benchmark.ts misc <target>")
    process.exit(1)
  }
  process.exit(runNodeScript(resolve(root, "check-misc-benchmarks.ts"), [target]))
}

if (mode === "tooling") {
  process.exit(runNodeScript(resolve(root, "verify-ctf-tooling.ts"), []))
}

if (familyNames.includes(mode as (typeof familyNames)[number])) {
  console.log(`No dedicated benchmark runner is wired yet for family: ${mode}`)
  process.exit(2)
}

console.log(`Unknown mode. Use one of: ${[...new Set([...familyNames, "tooling"])].join(", ")}`)
process.exit(1)
