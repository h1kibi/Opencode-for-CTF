import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { join, resolve } from "path"

type HardCase = {
  id: string
  category: string
  description: string
  artifacts: string[]
  expected: {
    primary_owner: string
    support_surface: string
    first_safe_tool: string
    hard_submode: string
    bottleneck_family: string
    source_first: boolean
    closure_required: boolean
    handoff_trigger: string
    stop_rule: string
  }
  metrics?: Record<string, unknown>
  notes?: string
}

const REQUIRED_STRINGS = ["id", "category", "description"]

const REQUIRED_EXPECTED = [
  "primary_owner",
  "support_surface",
  "first_safe_tool",
  "hard_submode",
  "bottleneck_family",
  "handoff_trigger",
  "stop_rule",
]

function findJsonCases(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...findJsonCases(full))
      continue
    }
    if (entry.endsWith(".json") && entry !== "case-template.json") out.push(full)
  }
  return out
}

function main() {
  const target = resolve(process.argv[2] || join("benchmarks", "hard-regression"))
  if (!existsSync(target)) {
    console.log(`Directory not found: ${target}`)
    process.exit(1)
  }

  const cases = findJsonCases(target)
  if (cases.length === 0) {
    console.log("No hard-regression case JSON files found")
    process.exit(1)
  }

  const failures: string[] = []
  console.log("# Hard Regression Case Audit\n")
  console.log("| Case | Status | Detail |")
  console.log("|---|---|---|")

  for (const file of cases) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as HardCase
      const missingTop = REQUIRED_STRINGS.filter((k) => !(parsed as Record<string, unknown>)[k])
      const missingExpected = REQUIRED_EXPECTED.filter((k) => !(parsed.expected as Record<string, unknown>)?.[k])
      const missingBooleans = [
        typeof parsed.expected?.source_first !== "boolean" ? "source_first" : "",
        typeof parsed.expected?.closure_required !== "boolean" ? "closure_required" : "",
      ].filter(Boolean)

      const allMissing = [...missingTop, ...missingExpected, ...missingBooleans]
      if (allMissing.length > 0) {
        failures.push(`${file}: missing ${allMissing.join(", ")}`)
        console.log(`| ${parsed.id || file} | FAIL | missing ${allMissing.join(", ")} |`)
        continue
      }

      console.log(
        `| ${parsed.id} | PASS | owner=${parsed.expected.primary_owner}, tool=${parsed.expected.first_safe_tool} |`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${file}: ${message}`)
      console.log(`| ${file} | FAIL | ${message.replace(/\|/g, "/")} |`)
    }
  }

  console.log("\n## Summary\n")
  console.log(`- Cases checked: ${cases.length}`)
  console.log(`- Failures: ${failures.length}`)
  if (failures.length > 0) {
    console.log("- Failure details:")
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }
}

main()
