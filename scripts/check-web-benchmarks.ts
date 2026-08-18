// Benchmark output checker — run via npm run check:benchmarks (scripts/ctf-benchmark.ts) or directly: npx tsx scripts/check-web-benchmarks.ts <target>
import { runFamilyBenchmarkSuite } from "./lib/benchmark-checker.ts"

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
      const hasRanking = ["Value", "Cost", "Risk", "Stability", "Confidence"].every((field) =>
        new RegExp(`\\b${field}\\b`, "i").test(output),
      )
      const hasDecision = /Decision/i.test(output)
      return hasRanking && hasDecision ? "PASS" : "FAIL"
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
    name: "pattern recall after candidate signal",
    check(output) {
      const hasPatternRecall = /ctf-web-pattern-search|pattern recall|pattern match/i.test(output)
      if (!hasPatternRecall) return "N/A"

      const reconIndex = output.search(/Recon Map/i)
      const queueIndex = output.search(/Attack Queue/i)
      const patternIndex = output.search(/ctf-web-pattern-search|pattern recall|pattern match/i)
      if (reconIndex < 0 || queueIndex < 0 || patternIndex < reconIndex || patternIndex < queueIndex) return "FAIL"

      const beforePattern = output.slice(0, patternIndex)
      const hasCandidateSignal =
        /candidate signal|signal:|selected candidate|candidate evidence|confirmed candidate/i.test(beforePattern)
      if (!hasCandidateSignal) return "FAIL"

      const afterPattern = output.slice(patternIndex)
      if (!/first safe check|safe check/i.test(afterPattern)) return "FAIL"
      return /(?:payload storm|sqlmap|ffuf|gobuster|hydra)/i.test(afterPattern) ? "FAIL" : "PASS"
    },
  },
  {
    name: "upload and file-write lanes separated",
    check(output) {
      const hasUpload = /upload/i.test(output)
      const hasFileWrite = /(?:file.?write|overwrite)/i.test(output)
      if (!hasUpload || !hasFileWrite) return "N/A"
      return /ctf-web-upload/i.test(output) && /ctf-web-file-write/i.test(output) ? "PASS" : "FAIL"
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
      return hasBudget.test(output) ? "PASS" : "N/A"
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

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-web-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

process.exit(
  await runFamilyBenchmarkSuite({
    family: "web",
    title: "Benchmark Results",
    targetDir: target,
    rules,
    outputFilePattern: /^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json)$/i,
    emptyArtifactHint: "notes.md, solve.py, etc.",
    recommendations: "review failures against `benchmarks/web/<name>/expected_behavior.md` and closure/evidence rules",
  }),
)
