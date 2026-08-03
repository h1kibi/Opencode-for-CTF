import { spawnSync } from "child_process"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
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

const root = resolve(dirname(fileURLToPath(import.meta.url)))

/** Default benchmark output dir for a family when no target is given. */
function defaultFamilyTarget(mode: string): string {
  return resolve(root, "..", "benchmarks", mode)
}

/** Family mode → checker script, with optional pre-flight smoke check. */
const FAMILY_RUNNERS: Record<string, { checker: string; smoke?: string }> = {
  web: { checker: "check-web-benchmarks.ts", smoke: "web-smoke-check.ts" },
  pwn: { checker: "check-pwn-benchmarks.ts", smoke: "pwn-smoke-check.ts" },
  crypto: { checker: "check-crypto-benchmarks.ts" },
  rev: { checker: "check-rev-benchmarks.ts" },
  forensics: { checker: "check-forensics-benchmarks.ts" },
  misc: { checker: "check-misc-benchmarks.ts" },
}

const runner = FAMILY_RUNNERS[mode]
if (runner) {
  const targetDir = target ?? defaultFamilyTarget(mode)
  if (runner.smoke) {
    const smoke = runNodeScript(resolve(root, runner.smoke), [])
    if (smoke !== 0) process.exit(smoke)
  }
  process.exit(runNodeScript(resolve(root, runner.checker), [targetDir]))
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
