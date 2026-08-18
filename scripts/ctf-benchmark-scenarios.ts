import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

type TraceContract = {
  requiredOrdered: string[]
  forbidden?: string[]
}

type ScenarioManifest = {
  schemaVersion: number
  id: string
  family: "web" | "pwn" | "crypto" | "rev" | "forensics" | "misc"
  description?: string
  passArtifact: string
  failArtifact: string
  traceContract?: {
    pass: TraceContract
    fail: TraceContract
  }
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const CHECKERS: Record<ScenarioManifest["family"], string> = {
  web: "check-web-benchmarks.ts",
  pwn: "check-pwn-benchmarks.ts",
  crypto: "check-crypto-benchmarks.ts",
  rev: "check-rev-benchmarks.ts",
  forensics: "check-forensics-benchmarks.ts",
  misc: "check-misc-benchmarks.ts",
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function discoverScenarioFiles(root: string): string[] {
  const found: string[] = []
  const visit = (dir: string) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue
      const full = join(dir, entry.name)
      if (entry.isFile() && entry.name === "scenario.json") found.push(full)
      else if (entry.isDirectory() && !entry.name.startsWith(".")) visit(full)
    }
  }
  visit(root)
  return found.sort()
}

function isTraceContract(value: unknown): value is TraceContract {
  if (!value || typeof value !== "object") return false
  const candidate = value as { requiredOrdered?: unknown; forbidden?: unknown }
  return (
    Array.isArray(candidate.requiredOrdered) &&
    candidate.requiredOrdered.every((event) => typeof event === "string" && event.trim().length > 0) &&
    (candidate.forbidden === undefined ||
      (Array.isArray(candidate.forbidden) &&
        candidate.forbidden.every((event) => typeof event === "string" && event.trim().length > 0)))
  )
}

function loadManifest(file: string, benchmarkRoot: string): ScenarioManifest {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<ScenarioManifest>
  if (!raw || typeof raw !== "object") throw new Error("scenario.json must contain an object")
  if (raw.schemaVersion !== 1) throw new Error("scenario.json schemaVersion must be 1")
  if (
    typeof raw.id !== "string" ||
    typeof raw.family !== "string" ||
    typeof raw.passArtifact !== "string" ||
    typeof raw.failArtifact !== "string" ||
    !raw.id.trim() ||
    !raw.passArtifact.trim() ||
    !raw.failArtifact.trim()
  ) {
    throw new Error("scenario.json requires non-empty id, family, passArtifact, and failArtifact strings")
  }
  if (!(raw.family in CHECKERS)) throw new Error(`unsupported scenario family: ${raw.family}`)

  const scenarioDir = resolve(file, "..")
  const nestedFamilyRoot = resolve(benchmarkRoot, raw.family)
  const familyRoot = inside(nestedFamilyRoot, scenarioDir) ? nestedFamilyRoot : resolve(benchmarkRoot)
  const expectedId = `${raw.family}/${relative(familyRoot, scenarioDir).replaceAll("\\", "/")}`
  if (raw.id !== expectedId) throw new Error(`scenario id must match its path: expected ${expectedId}, got ${raw.id}`)
  if (isAbsolute(raw.passArtifact) || isAbsolute(raw.failArtifact)) {
    throw new Error("passArtifact and failArtifact must be relative paths")
  }
  const passTarget = resolve(scenarioDir, raw.passArtifact)
  const failTarget = resolve(scenarioDir, raw.failArtifact)
  if (!inside(scenarioDir, passTarget) || !inside(scenarioDir, failTarget)) {
    throw new Error("scenario artifact path escapes scenario directory")
  }
  if (passTarget === failTarget) throw new Error("passArtifact and failArtifact must point to different directories")
  if (raw.traceContract && (!isTraceContract(raw.traceContract.pass) || !isTraceContract(raw.traceContract.fail))) {
    throw new Error("traceContract.pass and traceContract.fail must declare valid requiredOrdered event lists")
  }
  return raw as ScenarioManifest
}

function runChecker(checker: string, target: string): { status: number; output: string } {
  const result = spawnSync(process.execPath, [join(REPO_ROOT, "scripts", checker), target], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  })
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  }
}

function validateTrace(target: string, contract: TraceContract | undefined): { ok: boolean; reason: string } {
  if (!contract) return { ok: true, reason: "not declared" }
  const traceFile = join(target, "trace.json")
  if (!existsSync(traceFile)) return { ok: false, reason: "trace.json is missing" }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(traceFile, "utf8"))
  } catch (error) {
    return {
      ok: false,
      reason: `trace.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (!Array.isArray(raw)) return { ok: false, reason: "trace.json must contain an array" }

  const events: string[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || typeof (entry as { event?: unknown }).event !== "string") {
      return { ok: false, reason: `trace event ${index} must contain a string event field` }
    }
    const event = (entry as { event: string }).event.trim()
    if (!event) return { ok: false, reason: `trace event ${index} has an empty event name` }
    events.push(event)
  }

  let cursor = 0
  for (const required of contract.requiredOrdered) {
    const next = events.indexOf(required, cursor)
    if (next < 0) return { ok: false, reason: `required event is missing or out of order: ${required}` }
    cursor = next + 1
  }
  for (const forbidden of contract.forbidden ?? []) {
    if (events.includes(forbidden)) return { ok: false, reason: `forbidden event is present: ${forbidden}` }
  }
  return { ok: true, reason: `${events.length} events validated` }
}

const root = resolve(option("--root") ?? join(REPO_ROOT, "benchmarks"))
const family = option("--family") as ScenarioManifest["family"] | undefined
const id = option("--id")
const files = discoverScenarioFiles(root)
  .filter((file) => !family || file.split(/[\\/]/).includes(family))
  .filter((file) => {
    if (!id) return true
    try {
      return JSON.parse(readFileSync(file, "utf8")).id === id
    } catch {
      return true
    }
  })

if (files.length === 0) {
  console.error(`No benchmark scenario.json files found under ${root}`)
  process.exit(1)
}

let passed = 0
let failed = 0
console.log("# Benchmark Contract Scenarios")
console.log("\n| Scenario | Pass Case | Fail Case | Trace | Status |")
console.log("|----------|-----------|-----------|-------|--------|")

for (const file of files) {
  const scenarioDir = resolve(file, "..")
  try {
    const manifest = loadManifest(file, root)
    if (family && manifest.family !== family) continue
    const passTarget = resolve(scenarioDir, manifest.passArtifact)
    const failTarget = resolve(scenarioDir, manifest.failArtifact)
    if (!inside(scenarioDir, passTarget) || !inside(scenarioDir, failTarget)) {
      throw new Error("scenario artifact path escapes scenario directory")
    }
    if (!statSync(passTarget).isDirectory() || !statSync(failTarget).isDirectory()) {
      throw new Error("passArtifact and failArtifact must point to checker target directories")
    }

    const checker = CHECKERS[manifest.family]
    const passResult = runChecker(checker, passTarget)
    const failResult = runChecker(checker, failTarget)
    const passTrace = validateTrace(passTarget, manifest.traceContract?.pass)
    const failTrace = validateTrace(failTarget, manifest.traceContract?.fail)
    const traceOk = passTrace.ok && failTrace.ok
    const ok = passResult.status === 0 && failResult.status !== 0 && traceOk
    const traceDisplay = traceOk ? "PASS" : "FAIL"
    if (ok) {
      passed += 1
      console.log(
        `| ${manifest.id} | PASS (${passResult.status}) | REJECTED (${failResult.status}) | ${traceDisplay} | PASS |`,
      )
    } else {
      failed += 1
      console.log(
        `| ${manifest.id} | ${passResult.status === 0 ? "PASS" : "REJECTED"} (${passResult.status}) | ${failResult.status === 0 ? "PASS" : "REJECTED"} (${failResult.status}) | ${traceDisplay} | FAIL |`,
      )
      if (passResult.status !== 0) console.error(`\n${manifest.id} pass case output:\n${passResult.output}`)
      if (failResult.status === 0) console.error(`\n${manifest.id} fail case output:\n${failResult.output}`)
      if (!passTrace.ok) console.error(`\n${manifest.id} pass trace: ${passTrace.reason}`)
      if (!failTrace.ok) console.error(`\n${manifest.id} fail trace: ${failTrace.reason}`)
    }
  } catch (error) {
    failed += 1
    console.log(`| ${file} | ERROR | ERROR | FAIL |`)
    console.error(error instanceof Error ? error.message : String(error))
  }
}

console.log(`\n## Summary\n`)
console.log(`- PASS: ${passed}`)
console.log(`- FAIL: ${failed}`)
console.log(`- Contract: pass artifact must be accepted; fail artifact must be rejected.`)
console.log(`- Trace: declared pass/fail event sequences must be valid when a traceContract is present.`)
process.exit(failed > 0 ? 1 : 0)
