import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { resolve, join } from "path"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "static before dynamic",
    check(output) {
      const hasStatic = /file type|strings|imports|sections|static analysis|triage/i.test(output)
      const dynamicTooEarly = /(frida|gdb|dynamic instrumentation|trace|emulation)/i.test(output.split(/checker|validation|xrefs|static/i)[0] ?? "")
      if (!hasStatic) return "FAIL"
      return dynamicTooEarly ? "FAIL" : "PASS"
    },
  },
  {
    name: "artifact family routed",
    check(output) {
      const hasFamily = /native|apk|flutter|wasm|pyc|dotnet|go|rust|custom vm|artifact family/i.test(output)
      return hasFamily ? "PASS" : "FAIL"
    },
  },
  {
    name: "checker path extracted",
    check(output) {
      const hasChecker = /checker path|validation path|comparison oracle|success\/failure strings|xrefs/i.test(output)
      return hasChecker ? "PASS" : "FAIL"
    },
  },
  {
    name: "solver or executable checker emphasized",
    check(output) {
      const hasSolver = /solve\.py|extract logic into|executable checker|reproducible solver/i.test(output)
      return hasSolver ? "PASS" : "FAIL"
    },
  },
  {
    name: "fallback matrix or reference index used on stall",
    check(output) {
      const mentionsStall = /stalls|fallback|branch fails|When to Pivot|artifact-family reference index/i.test(output)
      return mentionsStall ? "PASS" : "N/A"
    },
  },
  {
    name: "evidence trail referenced",
    check(output) {
      return /(?:notes\.md|solve\.py|agent_flag\.txt|work[\\/]ctf-evidence)/i.test(output) ? "PASS" : "N/A"
    },
  },
]

function findOutputFiles(dir: string): string[] {
  const candidates: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const e of entries) {
      const full = join(dir, e)
      if (statSync(full).isDirectory() && !e.startsWith(".")) {
        candidates.push(...findOutputFiles(full))
      } else if (/^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json)$/i.test(e)) {
        candidates.push(full)
      }
    }
  } catch {
    // skip unreadable
  }
  return candidates
}

function runBenchmarks(targetDir: string) {
  const abs = resolve(targetDir)
  if (!existsSync(abs)) {
    console.log(`Directory not found: ${targetDir}`)
    process.exit(1)
  }

  const outputFiles = findOutputFiles(abs)
  let combined = ""
  for (const f of outputFiles) {
    try {
      combined += readFileSync(f, "utf8") + "\n"
    } catch {
      // skip
    }
  }

  if (outputFiles.length === 0) {
    console.log("No output files found (notes.md, solve.py, etc.)")
    process.exit(0)
  }

  console.log(`# Rev Benchmark Results`)
  console.log(`\n## Target: ${targetDir}\n`)
  console.log("| Rule | Status |")
  console.log("|------|--------|")

  let pass = 0
  let fail = 0
  const failures: string[] = []

  for (const rule of rules) {
    const status = rule.check(combined)
    console.log(`| ${rule.name} | ${status} |`)
    if (status === "PASS") pass++
    if (status === "FAIL") {
      fail++
      failures.push(rule.name)
    }
  }

  console.log(`\n## Summary\n`)
  console.log(`- Pass Rate: ${pass}/${pass + fail + (rules.length - pass - fail)}`)
  if (failures.length > 0) console.log(`- Critical Failures: ${failures.join(", ")}`)
  console.log("- Recommendations: review failures against family contract, rev fallback matrix, and reference index guidance")
}

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-rev-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

runBenchmarks(target)
