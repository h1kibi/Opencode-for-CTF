import { tool } from "@opencode-ai/plugin"

type LeakClass = "heap" | "libc" | "pie" | "stack" | "anonymous" | "safe_linked_fd_candidate" | "unknown"

type ClassifiedLeak = {
  raw: string
  normalized: string
  leakClass: LeakClass
  confidence: "high" | "medium" | "low"
  reason: string
  pageAlignedBase?: string
  safeLinkingCandidate: boolean
  nextHint: string
}

type MapRange = {
  start: bigint
  end: bigint
  label: string
}

function parsePointers(text: string) {
  return [...text.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0]).slice(0, 64)
}

function parseMaps(text: string) {
  const ranges: MapRange[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-fA-F]+)-([0-9a-fA-F]+)\s+\S+\s+\S+\s+\S+\s+\S+\s*(.*)$/)
    if (!m) continue
    try {
      ranges.push({
        start: BigInt(`0x${m[1]}`),
        end: BigInt(`0x${m[2]}`),
        label: (m[3] || "").trim(),
      })
    } catch {
      // ignore malformed ranges
    }
  }
  return ranges
}

function pageAlign(v: bigint) {
  return `0x${(v & ~0xfffn).toString(16)}`
}

function inRange(v: bigint, start: bigint, end: bigint) {
  return v >= start && v < end
}

function classifyFromMaps(v: bigint, maps: MapRange[]): ClassifiedLeak | undefined {
  for (const range of maps) {
    if (!inRange(v, range.start, range.end)) continue
    const label = range.label.toLowerCase()
    if (label.includes("[heap]")) {
      return {
        raw: `0x${v.toString(16)}`,
        normalized: `0x${v.toString(16)}`,
        leakClass: "heap",
        confidence: "high",
        reason: "value falls inside [heap] mapping",
        pageAlignedBase: pageAlign(v),
        safeLinkingCandidate: false,
        nextHint: "Check same-size refill and whether freed contents look like a tcache fd.",
      }
    }
    if (
      label.includes("libc") ||
      label.includes("libstdc++") ||
      label.includes("libm") ||
      label.includes("libpthread")
    ) {
      return {
        raw: `0x${v.toString(16)}`,
        normalized: `0x${v.toString(16)}`,
        leakClass: "libc",
        confidence: "high",
        reason: `value falls inside shared-library mapping: ${range.label || "library"}`,
        pageAlignedBase: pageAlign(v),
        safeLinkingCandidate: false,
        nextHint: "Pair with symbol-offset sanity before final libc math.",
      }
    }
    if (label.includes("[stack]")) {
      return {
        raw: `0x${v.toString(16)}`,
        normalized: `0x${v.toString(16)}`,
        leakClass: "stack",
        confidence: "high",
        reason: "value falls inside [stack] mapping",
        pageAlignedBase: pageAlign(v),
        safeLinkingCandidate: false,
        nextHint: "Do not use stack leak directly for final base math unless the exact relation is proven.",
      }
    }
    if (label === "" || label.includes("[anon") || label.includes("[heap:")) {
      return {
        raw: `0x${v.toString(16)}`,
        normalized: `0x${v.toString(16)}`,
        leakClass: "anonymous",
        confidence: "medium",
        reason: "value falls inside anonymous or unlabeled mapping",
        pageAlignedBase: pageAlign(v),
        safeLinkingCandidate: false,
        nextHint: "Check whether this anonymous region behaves like heap-adjacent storage or mmap-backed data.",
      }
    }
    return {
      raw: `0x${v.toString(16)}`,
      normalized: `0x${v.toString(16)}`,
      leakClass: "pie",
      confidence: "medium",
      reason: `value falls inside mapped file/PIE region: ${range.label || "main image"}`,
      pageAlignedBase: pageAlign(v),
      safeLinkingCandidate: false,
      nextHint: "Verify symbol relation before using this as a PIE base.",
    }
  }
  return undefined
}

function classifyByHeuristics(v: bigint): ClassifiedLeak {
  const hex = `0x${v.toString(16)}`
  const low12Zero = (v & 0xfffn) === 0n
  const maybeHeap = v >= 0x550000000000n && v < 0x700000000000n
  const maybeLibc = v >= 0x7f0000000000n && v < 0x800000000000n
  const maybeStack = v >= 0x7ff000000000n && v < 0x800000000000n
  const maybePie = v >= 0x555555554000n && v <= 0x56ffffffffffn
  const maybeSafeLinked = v !== 0n && v < 0x0100000000000000n && !low12Zero

  if (maybeLibc) {
    return {
      raw: hex,
      normalized: hex,
      leakClass: maybeStack ? "stack" : "libc",
      confidence: maybeStack ? "medium" : "medium",
      reason: maybeStack ? "high userspace range may be stack-like" : "high userspace shared-library-like range",
      pageAlignedBase: pageAlign(v),
      safeLinkingCandidate: false,
      nextHint: maybeStack
        ? "Check maps or repeated runs to separate stack from library mappings."
        : "Pair this with symbol offsets before final libc math.",
    }
  }

  if (maybePie) {
    return {
      raw: hex,
      normalized: hex,
      leakClass: "pie",
      confidence: "medium",
      reason: "typical amd64 PIE/main-image range",
      pageAlignedBase: pageAlign(v),
      safeLinkingCandidate: false,
      nextHint: "Verify with function or GOT relation before final PIE math.",
    }
  }

  if (maybeHeap) {
    return {
      raw: hex,
      normalized: hex,
      leakClass: "heap",
      confidence: "medium",
      reason: "low high-memory range is heap-like on common amd64 Linux layouts",
      pageAlignedBase: pageAlign(v),
      safeLinkingCandidate: false,
      nextHint: "Check same-size refill and whether neighboring freed contents imply tcache metadata.",
    }
  }

  if (maybeSafeLinked) {
    return {
      raw: hex,
      normalized: hex,
      leakClass: "safe_linked_fd_candidate",
      confidence: "low",
      reason: "value is pointer-shaped but low and unaligned enough to plausibly be a safe-linked tcache fd",
      pageAlignedBase: pageAlign(v),
      safeLinkingCandidate: true,
      nextHint: "Test whether `fd ^ (heap_base >> 12)` or refill ordering explains the next-pointer shape.",
    }
  }

  return {
    raw: hex,
    normalized: hex,
    leakClass: "unknown",
    confidence: "low",
    reason: "range does not confidently match heap/libc/PIE/stack and no maps confirmed it",
    pageAlignedBase: pageAlign(v),
    safeLinkingCandidate: false,
    nextHint:
      "Gather maps, repeat the leak, or obtain one more pointer from the same branch before doing final base math.",
  }
}

export default tool({
  description:
    "CTF pwn heap leak classifier: classify 5-8 byte pointer-shaped leaks as heap/libc/PIE/stack/anonymous or safe-linking candidates and suggest the next reduction step.",
  args: {
    leaks: tool.schema
      .string()
      .describe(
        "One or more leaked pointer values, transcript snippets, or debugger output containing 0x... addresses.",
      ),
    maps: tool.schema
      .string()
      .optional()
      .describe("Optional /proc/<pid>/maps text or vmmap-like output for stronger classification."),
    glibc: tool.schema.string().optional().describe("Optional glibc version hint such as 2.31, 2.35, or 'unknown'."),
  },
  async execute(args) {
    const leakText = String(args.leaks || "")
    if (leakText.trim().length < 3) return "BLOCK: provide one or more leaked addresses or transcript lines"

    const ptrs = parsePointers(leakText)
    if (!ptrs.length)
      return [
        "pwn_heap_leak_classifier:",
        "- no 0x... values detected",
        "recommended_next:",
        "- capture one leak transcript with explicit pointer-shaped output",
      ].join("\n")

    const maps = parseMaps(String(args.maps || ""))
    const glibc = String(args.glibc || "unknown").trim() || "unknown"
    const rows: ClassifiedLeak[] = []

    for (const raw of ptrs) {
      try {
        const value = BigInt(raw)
        const mapped = maps.length ? classifyFromMaps(value, maps) : undefined
        rows.push(mapped ?? classifyByHeuristics(value))
      } catch {
        rows.push({
          raw,
          normalized: raw,
          leakClass: "unknown",
          confidence: "low",
          reason: "failed to parse pointer value",
          safeLinkingCandidate: false,
          nextHint: "Re-capture the leak in plain hex form.",
        })
      }
    }

    const hasSafeLinkingContext = /^2\.(3[1-9]|[4-9]\d)/.test(glibc)
    const recommendations: string[] = []
    if (
      rows.some((row) => row.leakClass === "safe_linked_fd_candidate") ||
      (hasSafeLinkingContext && rows.some((row) => row.leakClass === "heap"))
    ) {
      recommendations.push(
        "Modern glibc context suggests safe-linking may matter; test same-size refill and XOR/key relations before final heap math.",
      )
    }
    if (rows.some((row) => row.leakClass === "unknown")) {
      recommendations.push(
        "At least one leak remains unknown-class; do not base final libc/heap/PIE math on it without one more classification probe.",
      )
    }
    if (rows.some((row) => row.leakClass === "heap")) {
      recommendations.push(
        "Heap-like leak present; pair it with allocator action ordering and stale-owner/refill identification.",
      )
    }
    if (rows.some((row) => row.leakClass === "libc")) {
      recommendations.push("Libc-like leak present; verify symbol relation before using it for final closure.")
    }

    return [
      "pwn_heap_leak_classifier:",
      `glibc_hint: ${glibc}`,
      `maps_supplied: ${maps.length ? "yes" : "no"}`,
      "classified:",
      ...rows.map(
        (row) =>
          `- ${row.raw}: class=${row.leakClass} confidence=${row.confidence} page_base=${row.pageAlignedBase ?? ""} safe_linking_candidate=${row.safeLinkingCandidate} reason=${row.reason}`,
      ),
      "recommended_next:",
      ...(recommendations.length
        ? recommendations.map((item) => `- ${item}`)
        : ["- Leak classes look coherent; continue with one-variable heap reduction and primitive promotion."]),
      "per_leak_next_hint:",
      ...rows.map((row) => `- ${row.raw}: ${row.nextHint}`),
    ].join("\n")
  },
})
