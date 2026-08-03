import { tool } from "@opencode-ai/plugin"

type LeakClass = "stack" | "heap" | "pie" | "libc" | "ld" | "vdso" | "kernel" | "unknown"

type LeakEntry = {
  raw: string
  value?: bigint
  leakClass: LeakClass
  reason: string
  repeated: boolean
  stableHint: boolean
  baseCandidate: boolean
  forbiddenForFinalMath: boolean
}

function classifyAddress(v: bigint): { leakClass: LeakClass; reason: string; baseCandidate: boolean } {
  if (v === 0n) return { leakClass: "unknown", reason: "null pointer", baseCandidate: false }
  if (v >= 0xffff800000000000n)
    return { leakClass: "kernel", reason: "canonical high kernel-like range", baseCandidate: false }
  if (v >= 0x7ffff7dd0000n && v <= 0x7ffffffffffen)
    return { leakClass: "libc", reason: "typical amd64 shared-library high userspace range", baseCandidate: true }
  if (v >= 0x7ffff7000000n && v < 0x7ffff7dd0000n)
    return { leakClass: "ld", reason: "possible dynamic loader / adjacent shared object region", baseCandidate: true }
  if (v >= 0x7ffffffd0000n && v <= 0x7ffffffffffen)
    return { leakClass: "stack", reason: "typical high userspace stack-like range", baseCandidate: false }
  if (v >= 0x555555554000n && v <= 0x56ffffffffffn)
    return { leakClass: "pie", reason: "typical PIE text / mapped main image range", baseCandidate: true }
  if (v >= 0x550000000000n && v < 0x555555554000n)
    return { leakClass: "heap", reason: "possible heap / mmap-adjacent low high-memory region", baseCandidate: false }
  if (v >= 0x400000n && v <= 0x7fffffffn)
    return { leakClass: "pie", reason: "possible non-PIE / low mapped text range", baseCandidate: true }
  return {
    leakClass: "unknown",
    reason: "range does not confidently identify stack/heap/pie/libc",
    baseCandidate: false,
  }
}

function parsePointers(text: string) {
  const matches = [...text.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0])
  return matches.slice(0, 64)
}

function countOccurrences(items: string[]) {
  const map = new Map<string, number>()
  for (const item of items) map.set(item, (map.get(item) || 0) + 1)
  return map
}

export default tool({
  description:
    "CTF pwn leak ledger: classify leaked pointers, flag unknown-class base misuse risk, and summarize stability hints for complex PWN routing.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Leak transcript, debugger output, pwntools logs, or notes containing leaked addresses and base assumptions.",
      ),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    if (text.trim().length < 10) return "BLOCK: provide leak transcript or notes with leaked addresses"

    const ptrs = parsePointers(text)
    if (!ptrs.length)
      return [
        "pwn_leak_ledger:",
        "- no explicit 0x... pointers detected",
        "recommended_next:",
        "- gather one stable leak transcript before doing base math",
      ].join("\n")

    const counts = countOccurrences(ptrs)
    const entries: LeakEntry[] = ptrs.map((raw) => {
      let value: bigint | undefined
      try {
        value = BigInt(raw)
      } catch {
        value = undefined
      }
      const base =
        value === undefined
          ? { leakClass: "unknown" as LeakClass, reason: "parse failure", baseCandidate: false }
          : classifyAddress(value)
      const repeated = (counts.get(raw) || 0) > 1
      const stableHint = repeated || /stable|repeat|same leak|same pointer|reliable/i.test(text)
      const forbiddenForFinalMath =
        base.leakClass === "unknown" || base.leakClass === "stack" || base.leakClass === "heap"
      return {
        raw,
        value,
        leakClass: base.leakClass,
        reason: base.reason,
        repeated,
        stableHint,
        baseCandidate: base.baseCandidate,
        forbiddenForFinalMath,
      }
    })

    const uniq = new Map<string, LeakEntry>()
    for (const e of entries) if (!uniq.has(e.raw)) uniq.set(e.raw, e)
    const deduped = [...uniq.values()].slice(0, 24)

    const classCounts = new Map<LeakClass, number>()
    for (const e of deduped) classCounts.set(e.leakClass, (classCounts.get(e.leakClass) || 0) + 1)

    const dangerous = deduped.filter((e) => e.forbiddenForFinalMath)
    const baseCandidates = deduped.filter((e) => e.baseCandidate)

    const recommendations: string[] = []
    if (dangerous.length)
      recommendations.push(
        "Do not compute final bases from unknown/stack/heap leaks unless the exact relation is proven.",
      )
    if (!baseCandidates.length)
      recommendations.push(
        "No confident PIE/libc/ld base candidate detected; prioritize leak classification before gadget/libc mutation.",
      )
    if (deduped.some((e) => !e.stableHint))
      recommendations.push(
        "Re-run the leak path to check whether the same pointer repeats before trusting it for remote adaptation.",
      )
    if (baseCandidates.some((e) => e.leakClass === "libc"))
      recommendations.push(
        "If a bundled libc exists, pair the libc-like leak with symbol-offset sanity before final ret2libc math.",
      )

    return [
      "pwn_leak_ledger:",
      `pointers_detected: ${ptrs.length}`,
      "class_counts:",
      ...(["stack", "heap", "pie", "libc", "ld", "vdso", "kernel", "unknown"] as LeakClass[]).map(
        (c) => `- ${c}: ${classCounts.get(c) || 0}`,
      ),
      "ledger:",
      ...deduped.map(
        (e) =>
          `- ${e.raw}: class=${e.leakClass} repeated=${e.repeated} stable_hint=${e.stableHint} base_candidate=${e.baseCandidate} forbidden_final_math=${e.forbiddenForFinalMath} reason=${e.reason}`,
      ),
      "danger_flags:",
      ...(dangerous.length
        ? dangerous.map((e) => `- ${e.raw}: do_not_use_for_final_base_math_without_extra_proof`)
        : ["- none"]),
      "recommended_next:",
      ...(recommendations.length
        ? recommendations.map((x) => `- ${x}`)
        : ["- Leak classes look coherent; continue with one-variable base sanity and closure planning."]),
    ].join("\n")
  },
})
