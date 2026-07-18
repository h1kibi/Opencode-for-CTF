import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { resolve, join } from "path"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "preserve originals first",
    check(output) {
      const hasPreserve = /preserve originals|work only on copies|sha-256 hash|file inventory with hashes/i.test(output)
      return hasPreserve ? "PASS" : "FAIL"
    },
  },
  {
    name: "triage before deep extraction",
    check(output) {
      const hasTriage = /triage findings|file type|strings|binwalk|exiftool|artifact surface/i.test(output)
      return hasTriage ? "PASS" : "FAIL"
    },
  },
  {
    name: "dedicated probes before raw loops",
    check(output) {
      const hasProbe = /ctf-pcap-probe|ctf-stego-probe|ctf-artifact-page/i.test(output)
      const rawOnly = /(tshark|binwalk|olevba|volatility)/i.test(output) && !hasProbe
      if (rawOnly) return "FAIL"
      return hasProbe ? "PASS" : "N/A"
    },
  },
  {
    name: "artifact provenance recorded",
    check(output) {
      const hasProvenance = /artifact path|offset|stream id|inode|derived path|reconstruction provenance/i.test(output)
      return hasProvenance ? "PASS" : "FAIL"
    },
  },
  {
    name: "surface-specific route chosen",
    check(output) {
      const hasRoute = /disk forensics|memory forensics|network forensics|stego|document forensics|binary analysis/i.test(output)
      return hasRoute ? "PASS" : "FAIL"
    },
  },
  {
    name: "verification from reconstruction",
    check(output) {
      const hasVerify = /can you reproduce the flag|deterministic extraction|verify each piece has a clear source|final flag/i.test(output)
      return hasVerify ? "PASS" : "FAIL"
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

  console.log(`# Forensics Benchmark Results`)
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
  console.log("- Recommendations: review failures against family contract, forensics fallback matrix, and reference index guidance")
}

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-forensics-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

runBenchmarks(target)
