// Benchmark output checker — run via npm run check:benchmarks (scripts/ctf-benchmark.ts) or directly: npx tsx scripts/check-forensics-benchmarks.ts <target>
import { runFamilyBenchmarkSuite } from "./lib/benchmark-checker.ts"

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
      const hasRoute =
        /disk forensics|memory forensics|network forensics|stego|document forensics|binary analysis/i.test(output)
      return hasRoute ? "PASS" : "FAIL"
    },
  },
  {
    name: "verification from reconstruction",
    check(output) {
      const hasVerify =
        /can you reproduce the flag|deterministic extraction|verify each piece has a clear source|final flag/i.test(
          output,
        )
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

const target = process.argv[2]
if (!target) {
  console.log("Usage: npx tsx scripts/check-forensics-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

process.exit(
  await runFamilyBenchmarkSuite({
    family: "forensics",
    title: "Forensics Benchmark Results",
    targetDir: target,
    rules,
    outputFilePattern: /^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json)$/i,
    emptyArtifactHint: "notes.md, solve.py, etc.",
    recommendations: "review failures against family contract, forensics fallback matrix, and reference index guidance",
  }),
)
