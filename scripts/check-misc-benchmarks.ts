import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { resolve, join } from "path"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "classify before heavy tools",
    check(output) {
      const hasClassify = /classification|initial category signals|classify the challenge before using heavy tools/i.test(output)
      return hasClassify ? "PASS" : "FAIL"
    },
  },
  {
    name: "reversible transform or minimal client first",
    check(output) {
      const hasMinimal = /reversible transformation chain|minimal client|solver reproducible|protocol grammar/i.test(output)
      return hasMinimal ? "PASS" : "FAIL"
    },
  },
  {
    name: "specialist handoff when family becomes clear",
    check(output) {
      const hasHandoff = /hand off to|escalate to|actual category is clear|specialist family/i.test(output)
      return hasHandoff ? "PASS" : "FAIL"
    },
  },
  {
    name: "jail or protocol evidence bounded",
    check(output) {
      const mentionsJail = /jail|sandbox|protocol|state transitions|client/i.test(output)
      if (!mentionsJail) return "N/A"
      const hasBound = /allowed syntax|blocked strings|minimal client|grammar|side channels/i.test(output)
      return hasBound ? "PASS" : "FAIL"
    },
  },
  {
    name: "evidence trail referenced",
    check(output) {
      return /(?:notes\.md|solve\.py|solve\.js|agent_flag\.txt|work[\\/]ctf-evidence)/i.test(output) ? "PASS" : "N/A"
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
    console.log("No output files found (notes.md, solve.py, solve.js, etc.)")
    process.exit(0)
  }

  console.log(`# Misc Benchmark Results`)
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
  console.log("- Recommendations: review failures against family contract, misc fallback matrix, and reference index guidance")
}

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-misc-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

runBenchmarks(target)
