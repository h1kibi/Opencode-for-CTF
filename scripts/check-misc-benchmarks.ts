// Benchmark output checker — run via npm run check:benchmarks (scripts/ctf-benchmark.ts) or directly: npx tsx scripts/check-misc-benchmarks.ts <target>
import { runFamilyBenchmarkSuite } from "./lib/benchmark-checker.ts"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "classify before heavy tools",
    check(output) {
      const hasClassify =
        /classification|initial category signals|classify the challenge before using heavy tools/i.test(output)
      return hasClassify ? "PASS" : "FAIL"
    },
  },
  {
    name: "reversible transform or minimal client first",
    check(output) {
      const hasMinimal = /reversible transformation chain|minimal client|solver reproducible|protocol grammar/i.test(
        output,
      )
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

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-misc-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

process.exit(
  await runFamilyBenchmarkSuite({
    family: "misc",
    title: "Misc Benchmark Results",
    targetDir: target,
    rules,
    outputFilePattern: /^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json)$/i,
    emptyArtifactHint: "notes.md, solve.py, solve.js, etc.",
    recommendations: "review failures against family contract, misc fallback matrix, and reference index guidance",
  }),
)
