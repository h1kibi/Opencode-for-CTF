import { tool } from "@opencode-ai/plugin"

function extractPointers(text: string) {
  return [...text.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0])
}

function extractFlagLike(text: string) {
  return [...text.matchAll(/[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g)].map((m) => m[0])
}

function countMap(items: string[]) {
  const m = new Map<string, number>()
  for (const item of items) m.set(item, (m.get(item) || 0) + 1)
  return m
}

export default tool({
  description: "CTF pwn leak stability check: compare repeated outputs or leak transcripts and judge whether key leaks are stable enough for final math.",
  args: {
    evidence: tool.schema.string().describe("Repeated outputs, runner transcripts, pwntools logs, or concatenated leak transcripts from multiple runs."),
    focus: tool.schema.string().optional().describe("Optional focus token such as a specific address, symbol note, or 'flag'."),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    if (text.trim().length < 20) return "BLOCK: provide repeated outputs or leak transcripts"
    const chunks = text.split(/\n\s*---+\s*\n|\n\s*===+\s*\n|\n\s*RUN\s*#?\d+\s*:?\s*\n/i).map((x) => x.trim()).filter(Boolean)
    const runs = chunks.length >= 2 ? chunks : text.split(/\r?\n/).filter(Boolean).length > 4 ? [text] : [text]
    const allPtrs = runs.map(extractPointers)
    const flatPtrs = allPtrs.flat()
    const ptrCounts = countMap(flatPtrs)
    const repeatedPtrs = [...ptrCounts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const flags = extractFlagLike(text)
    const focus = String(args.focus || "").trim().toLowerCase()
    const focusHit = focus ? text.toLowerCase().includes(focus) : false
    const uniquePerRun = allPtrs.map((ptrs) => new Set(ptrs).size)
    const stability = repeatedPtrs.length ? (runs.length >= 2 ? "stable_or_repeatable_signal_present" : "repeat_signal_seen_but_multi-run_separation_unclear") : (runs.length >= 2 ? "unstable_or_nonrepeating" : "insufficient_multi_run_structure")
    const recommended = [
      repeatedPtrs.length ? "Candidate stable pointers repeat across runs; pair them with leak class/base sanity before final math." : "No clear repeating pointer across runs; do not trust final base math yet.",
      runs.length >= 2 ? "Treat non-repeating leak shapes as unstable unless parser/input randomness is explained." : "Separate future leak captures into run-delimited blocks for stronger stability judgment.",
      flags.length ? "Flag-like output exists; closure may be closer than more leak optimization." : "If closure still depends on leak math, re-run the same probe under one unchanged environment assumption.",
    ]
    return [
      "pwn_leak_stability_check:",
      `runs_observed: ${runs.length}`,
      `focus_token: ${focus || "none"}`,
      `focus_present: ${focusHit}`,
      `distinct_pointer_events: ${flatPtrs.length}`,
      `flag_like_hits: ${flags.length}`,
      `stability_class: ${stability}`,
      `unique_pointers_per_run: ${uniquePerRun.join(", ") || "n/a"}`,
      "repeating_candidates:",
      ...(repeatedPtrs.length ? repeatedPtrs.map(([ptr, n]) => `- ${ptr}: seen ${n} times`) : ["- none"]),
      "recommended_next:",
      ...recommended.map((x) => `- ${x}`),
    ].join("\n")
  },
})
