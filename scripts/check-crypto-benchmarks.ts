import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { resolve, join } from "path"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "parameter inventory before brute force",
    check(output) {
      const hasInventory = /parameter inventory|bit lengths|nonce behavior|oracle transcript|primitive decision tree/i.test(output)
      return hasInventory ? "PASS" : "FAIL"
    },
  },
  {
    name: "rsa probe before manual attack",
    check(output) {
      if (!/(?:rsa|modulus|public exponent|ciphertext)/i.test(output)) return "N/A"
      const hasProbe = /ctf-rsa-probe/i.test(output)
      return hasProbe ? "PASS" : "FAIL"
    },
  },
  {
    name: "reversible first before brute force",
    check(output) {
      const mentionsClassical = /xor|substitution|transposition|base64|hex|compression|encoding/i.test(output)
      if (!mentionsClassical) return "N/A"
      const bruteFirst = /brute force|guess-and-check/i.test(output.split(/reversible|decode|transform/i)[0] ?? "")
      return bruteFirst ? "FAIL" : "PASS"
    },
  },
  {
    name: "oracle behavior recorded before attack",
    check(output) {
      if (!/(?:oracle|request|response|signing service|decrypt service)/i.test(output)) return "N/A"
      const hasTranscript = /oracle transcript|request\/response|error class|determinism|timing/i.test(output)
      return hasTranscript ? "PASS" : "FAIL"
    },
  },
  {
    name: "weakness statement recorded",
    check(output) {
      const hasWeakness = /stated weakness|specific rsa assumption broken|nonce reuse|padding oracle|invalid curve|keystream reuse/i.test(output)
      return hasWeakness ? "PASS" : "FAIL"
    },
  },
  {
    name: "verification path recorded",
    check(output) {
      const hasVerify = /re-encrypt|verify plaintext|verify signature|challenge constraints|decoded output matching flag format/i.test(output)
      return hasVerify ? "PASS" : "FAIL"
    },
  },
  {
    name: "evidence trail referenced",
    check(output) {
      return /(?:notes\.md|solve\.py|solve\.sage|agent_flag\.txt|work[\\/]ctf-evidence)/i.test(output) ? "PASS" : "N/A"
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
      } else if (/^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json|sage)$/i.test(e)) {
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
    console.log("No output files found (notes.md, solve.py, solve.sage, etc.)")
    process.exit(0)
  }

  console.log(`# Crypto Benchmark Results`)
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
  console.log("- Recommendations: review failures against family contract, crypto fallback matrix, and reference index guidance")
}

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-crypto-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

runBenchmarks(target)
