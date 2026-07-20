import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { resolve, join } from "path"

interface BenchmarkRule {
  name: string
  check: (output: string) => "PASS" | "FAIL" | "N/A"
}

const rules: BenchmarkRule[] = [
  {
    name: "binary probe early",
    check(output) {
      const hasProbe = /ctf-binary-probe/i.test(output)
      return hasProbe ? "PASS" : "FAIL"
    },
  },
  {
    name: "fast ret2win stays fast-lane",
    check(output) {
      if (!/(?:ret2win|print_flag|\bwin\b)/i.test(output)) return "N/A"
      const hasFast = /ctf-fast|fast lane|short-budget opener/i.test(output)
      return hasFast ? "PASS" : "FAIL"
    },
  },
  {
    name: "format string leak-first",
    check(output) {
      if (!/(?:format string|printf-like|%p|%n|fmtstr)/i.test(output)) return "N/A"
      const hasFormatMap = /ctf-pwn-format-map/i.test(output)
      const earlyWriteOnly = /%(?:n|hn|hhn)/i.test(output) && !/offset|leak/i.test(output)
      if (earlyWriteOnly) return "FAIL"
      return hasFormatMap ? "PASS" : "FAIL"
    },
  },
  {
    name: "control leads to calibration",
    check(output) {
      const hasControl = /CONTROL_CONFIRMED|Crash \/ Control|control confirmed|offset/i.test(output)
      if (!hasControl) return "N/A"
      const hasCalibration = /CALIBRATION|Calibration Ledger|one variable at a time|minimum local closure proof/i.test(
        output,
      )
      return hasCalibration ? "PASS" : "FAIL"
    },
  },
  {
    name: "primitive compressed into closure",
    check(output) {
      const hasPrimitive = /primitive|arbitrary read|arbitrary write|stable leak|Route Lock Card|closure card/i.test(
        output,
      )
      if (!hasPrimitive) return "N/A"
      const hasClosure =
        /shortest closure family|shortest closure hypothesis|next 3 probes only|direct flag|file-read|secret-bearing pointer|minimum local closure proof/i.test(
          output,
        )
      return hasClosure ? "PASS" : "FAIL"
    },
  },
  {
    name: "format string prefers read closure before clever writes",
    check(output) {
      if (!/(?:format string|printf-like|%p|%n|fmtstr)/i.test(output)) return "N/A"
      const hasReadClosure = /got leak|libc leak|read@got|puts@got|secret-bearing pointer|buffer read|file-read/i.test(
        output,
      )
      const heavyWriteDrift =
        /(?:\.fini_array|self-modifying format|complex %n|byte choreography|control-flow patch)/i.test(output)
      if (heavyWriteDrift && !hasReadClosure) return "FAIL"
      return hasReadClosure ? "PASS" : "N/A"
    },
  },
  {
    name: "bundled libc hard gate before heap validation",
    check(output) {
      const hasBundledLibc = /bundled libc|libc\.so\.6|ld-linux|ld-.*\.so|ctf-pwn-libc-runtime-doctor/i.test(output)
      if (!hasBundledLibc) return "N/A"
      const hasGate =
        /ctf-pwn-libc-runtime-doctor|substrate_gate|explicit loader command|do not validate heap or overlap on mismatched base/i.test(
          output,
        )
      return hasGate ? "PASS" : "FAIL"
    },
  },
  {
    name: "heap uaf enters reduction mode",
    check(output) {
      const hasHeapUaf =
        /uaf|use-after-free|stale reference|stale display|post-free display|repeated allocator actions|buy\/use\/sell/i.test(
          output,
        )
      if (!hasHeapUaf) return "N/A"
      const hasReduction =
        /heap reduction|chunk lifecycle|size class|same-size refill|stale owner|primitive ladder stage|heap transaction/i.test(
          output,
        )
      return hasReduction ? "PASS" : "FAIL"
    },
  },
  {
    name: "leak classification before heap math",
    check(output) {
      const hasLeak = /0x[0-9a-f]{5,16}|pointer-shaped leak|6-byte leak|8-byte leak|heap leak/i.test(output)
      if (!hasLeak) return "N/A"
      const hasClassification =
        /heap leak classifier|class=heap|class=libc|class=pie|safe-linked|unknown-class leak|maps range check|page alignment/i.test(
          output,
        )
      return hasClassification ? "PASS" : "FAIL"
    },
  },
  {
    name: "cxx inventory object model before closure drift",
    check(output) {
      const hasCxxInventory =
        /inventory|equipment|description|wrapper object|shared_ptr|consume\/use\/sell|object model/i.test(output)
      if (!hasCxxInventory) return "N/A"
      const hasObjectModel =
        /object model|field offset|allocation order|display order|wrapper vs inner object|stale consumer/i.test(output)
      return hasObjectModel ? "PASS" : "FAIL"
    },
  },
  {
    name: "menu read contract locked before drift",
    check(output) {
      const hasMenuContractSignal =
        /read\(size\+1\)|exact-length read|mixed menu\/raw|menu contract|ctf-pwn-menu-contract-probe/i.test(output)
      if (!hasMenuContractSignal) return "N/A"
      const hasLock =
        /ctf-pwn-menu-contract-probe|helper contract|sendafter\(\)|sendlineafter\(\)|newline remains buffered|exact-length send helper/i.test(
          output,
        )
      return hasLock ? "PASS" : "FAIL"
    },
  },
  {
    name: "near-success classified before drift",
    check(output) {
      if (!/(?:partial shell|one-shot command|prompt desync|stdout\/stderr|near-success|odd prompt)/i.test(output))
        return "N/A"
      const classified =
        /shell likely spawned|one-shot command execution only|file-read primitive likely works|prompt desync|stdout\/stderr/i.test(
          output,
        )
      return classified ? "PASS" : "FAIL"
    },
  },
  {
    name: "seccomp routes to orw",
    check(output) {
      if (!/(?:seccomp|sandbox|blocked-shell|static\/syscall|ORW)/i.test(output)) return "N/A"
      const hasOrw = /ctf-pwn-syscall-orw-check|ORW|open-read-write|direct file-read/i.test(output)
      return hasOrw ? "PASS" : "FAIL"
    },
  },
  {
    name: "heap route is version-gated",
    check(output) {
      if (!/(?:heap|tcache|fastbin|unsorted bin|double-free|uaf|off-by-one)/i.test(output)) return "N/A"
      const hasMap = /ctf-pwn-heap-menu-map|heap-version-route-matrix|heap-family-first-questions/i.test(output)
      return hasMap ? "PASS" : "FAIL"
    },
  },
  {
    name: "remote drift checked before roulette",
    check(output) {
      if (!/(?:remote fails|local works|EOF|timeout|remote drift|transcript diff)/i.test(output)) return "N/A"
      const hasDriftCheck = /ctf-pwn-remote-drift-check|remote-local-divergence/i.test(
        output,
      )
      return hasDriftCheck ? "PASS" : "FAIL"
    },
  },
  {
    name: "evidence trail referenced",
    check(output) {
      const hasEvidence =
        /(?:work[\\/]ctf-evidence|final-verification|solve-output|ctf_handoff|ctf_evidence_snapshot)/i.test(output)
      return hasEvidence ? "PASS" : "N/A"
    },
  },
  {
    name: "handoff includes closure and next probe quality",
    check(output) {
      const hasHandoff =
        /handoff|ctf_fast_handoff|ctf_resume_packet|escalated|why this is no longer a fast-lane target/i.test(output)
      if (!hasHandoff) return "N/A"
      const hasQuality = /shortest closure family|best next rigorous probe|oracle|falsify|same-family attempts/i.test(
        output,
      )
      return hasQuality ? "PASS" : "FAIL"
    },
  },
  {
    name: "wrong-complexity drift acknowledged",
    check(output) {
      const hasDriftSignal =
        /\.fini_array|self-modifying format|cross-round slot stability|glibc object graph|repeated gdb|wrong-complexity/i.test(
          output,
        )
      if (!hasDriftSignal) return "N/A"
      const hasResponse = /handoff|rerank|shortest closure family|fast-lane target|ctf-expert/i.test(output)
      return hasResponse ? "PASS" : "FAIL"
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
      } else if (
        /^(notes|solve|exploit|agent_flag|output|log|result|final-verification)\.(md|txt|py|js|json)$/i.test(e)
      ) {
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
    console.log("No output files found (notes.md, solve.py, exploit.py, final-verification.txt, etc.)")
    process.exit(0)
  }

  console.log(`# PWN Benchmark Results`)
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
  if (failures.length > 0) {
    console.log(`- Critical Failures: ${failures.join(", ")}`)
  }
  console.log(
    "- Recommendations: review failures against `benchmarks/pwn/<name>/expected_behavior.md` and current closure/runtime discipline",
  )
}

const target = process.argv[2]
if (!target) {
  console.log("Usage: node scripts/check-pwn-benchmarks.ts <benchmark-directory-or-log-dir>")
  process.exit(1)
}

runBenchmarks(target)
