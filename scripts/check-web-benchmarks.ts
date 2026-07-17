import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { resolve, relative, join } from "path"

interface BenchmarkRule {
  name: string
  check: (output: string, meta: { dir: string }) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "recon before exploit",
    check(output) {
      const hasRecon = /Recon Map/i.test(output)
      const hasExploitBeforeRecon = /(?:xss|sqli|injection|exploit|payload|shell)/i.test(
        output.split(/Recon Map/i)[0] ?? "",
      )
      if (!hasRecon) return "FAIL"
      return hasExploitBeforeRecon ? "FAIL" : "PASS"
    },
  },
  {
    name: "attack queue ranked",
    check(output) {
      const hasQueue = /Attack Queue/i.test(output)
      if (!hasQueue) return "FAIL"
      const hasRanking = /(?:Value|Cost|Risk|Stability|Confidence)/i.test(output)
      return hasRanking ? "PASS" : "FAIL"
    },
  },
  {
    name: "no wordlist first",
    check(output) {
      const beforeQueue = output.split(/Attack Queue/i)[0] ?? ""
      const hasWordlistEarly = /(?:ffuf|gobuster|feroxbuster|dirsearch|wfuzz|sqlmap|hydra)/i.test(beforeQueue)
      return hasWordlistEarly ? "FAIL" : "PASS"
    },
  },
  {
    name: "java-map first pass",
    check(output, meta) {
      if (!/\.(java|jsp|jar|war)$/i.test(output) && !/pom\.xml|build\.gradle/i.test(output)) return "N/A"
      const hasMap = /ctf-java-map/i.test(output)
      return hasMap ? "PASS" : "FAIL"
    },
  },
  {
    name: "file-write routed to ctf-web-file-write",
    check(output) {
      if (!/(?:file.?write?|overwrite|upload)/i.test(output)) return "N/A"
      const hasSkill = /ctf-web-file-write/i.test(output)
      return hasSkill ? "PASS" : "FAIL"
    },
  },
  {
    name: "canary before destructive",
    check(output) {
      const destructive = /(?:overwrite|rm\s|delete\s|DROP\s|TRUNCATE|shutdown)/i
      const canary = /canary/i
      if (!destructive.test(output)) return "N/A"
      return canary.test(output) ? "PASS" : "FAIL"
    },
  },
  {
    name: "attempt budget recorded",
    check(output) {
      const hasBudget = /(?:budget|max.?attempts|attempt limit|retry limit)/i
      return hasBudget ? "PASS" : "N/A"
    },
  },
  {
    name: "closure path recorded after primitive",
    check(output) {
      const hasPrimitive = /(?:Primitive Ledger|confirmed primitive|high-value primitive)/i.test(output)
      if (!hasPrimitive) return "N/A"
      const hasClosure =
        /(?:closure path|closure owner|closure probe|flag-location hypothesis|web-closure-matrix)/i.test(output)
      return hasClosure ? "PASS" : "FAIL"
    },
  },
  {
    name: "evidence trail referenced",
    check(output) {
      const hasEvidence =
        /(?:work[\\/]ctf-evidence|final-verification|solve-output|ctf_evidence_snapshot|ctf_handoff)/i.test(output)
      return hasEvidence ? "PASS" : "N/A"
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

  console.log(`# Benchmark Results`)
  console.log(`\n## Target: ${targetDir}\n`)
  console.log("| Rule | Status |")
  console.log("|------|--------|")

  let pass = 0
  let fail = 0
  const failures: string[] = []

  for (const rule of rules) {
    const status = rule.check(combined, { dir: abs })
    console.log(`| ${rule.name} | ${status} |`)
    if (status === "PASS") pass++
    if (status === "FAIL") {
      fail++
      failures.push(rule.name)
    }
  }

  console.log(`\n## Summary\n`)
  console.log(`- Pass Rate: ${pass}/${pass + fail + (rules.length - pass - fail)}`)
  if (failures.length > 0) {
    console.log(`- Critical Failures: ${failures.join(", ")}`)
  }
  console.log(
    "- Recommendations: review failures against `benchmarks/web/<name>/expected_behavior.md` and closure/evidence rules",
  )
}

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-web-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

runBenchmarks(target)
