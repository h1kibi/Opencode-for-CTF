// Benchmark output checker — run via npm run check:benchmarks (scripts/ctf-benchmark.ts) or directly: npx tsx scripts/check-rev-benchmarks.ts <target>
import { runFamilyBenchmarkSuite } from "./lib/benchmark-checker.ts"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "static before dynamic",
    check(output) {
      const hasStatic = /file type|strings|imports|sections|static analysis|triage/i.test(output)
      const dynamicTooEarly = /(frida|gdb|dynamic instrumentation|trace|emulation)/i.test(
        output.split(/checker|validation|xrefs|static/i)[0] ?? "",
      )
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

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-rev-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

process.exit(
  await runFamilyBenchmarkSuite({
    family: "rev",
    title: "Rev Benchmark Results",
    targetDir: target,
    rules,
    outputFilePattern: /^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json)$/i,
    emptyArtifactHint: "notes.md, solve.py, etc.",
    recommendations: "review failures against family contract, rev fallback matrix, and reference index guidance",
  }),
)
