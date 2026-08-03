import { tool } from "@opencode-ai/plugin"

function tokenizeOps(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
  const out: Array<{ line: string; op: string }> = []
  for (const line of lines) {
    if (/\b(add|alloc|create|new|malloc)\b/i.test(line)) out.push({ line, op: "alloc" })
    else if (/\b(delete|free|remove|destroy|drop)\b/i.test(line)) out.push({ line, op: "free" })
    else if (/\b(edit|write|update|set)\b/i.test(line)) out.push({ line, op: "edit" })
    else if (/\b(show|read|view|print|dump|display)\b/i.test(line)) out.push({ line, op: "show" })
  }
  return out
}

function diffCounts(beforeOps: Array<{ op: string }>, afterOps: Array<{ op: string }>) {
  const kinds = ["alloc", "free", "edit", "show"] as const
  return kinds.map((k) => {
    const b = beforeOps.filter((x) => x.op === k).length
    const a = afterOps.filter((x) => x.op === k).length
    return { kind: k, before: b, after: a, delta: a - b }
  })
}

export default tool({
  description:
    "CTF pwn heap state diff: compare before/after heap operation notes or snapshots and summarize lifecycle, leak, and overlap-reduction clues.",
  args: {
    beforeEvidence: tool.schema
      .string()
      .describe("Earlier heap notes, operation list, gdb heap summary, or menu transcript before a sequence."),
    afterEvidence: tool.schema
      .string()
      .describe("Later heap notes, operation list, gdb heap summary, or menu transcript after a sequence."),
  },
  async execute(args) {
    const beforeText = String(args.beforeEvidence || "")
    const afterText = String(args.afterEvidence || "")
    if (beforeText.trim().length < 5 || afterText.trim().length < 5)
      return "BLOCK: provide both beforeEvidence and afterEvidence"

    const beforeOps = tokenizeOps(beforeText)
    const afterOps = tokenizeOps(afterText)
    const deltas = diffCounts(beforeOps, afterOps)

    const clues: string[] = []
    if (deltas.find((d) => d.kind === "free" && d.delta > 0) && deltas.find((d) => d.kind === "edit" && d.delta > 0))
      clues.push("post-free edit activity increased: check UAF / stale reference reuse")
    if (deltas.find((d) => d.kind === "show" && d.delta > 0))
      clues.push("readback activity increased: compare for leak stability or metadata exposure")
    if (deltas.find((d) => d.kind === "alloc" && d.delta > 0) && deltas.find((d) => d.kind === "free" && d.delta > 0))
      clues.push("allocation/free churn increased: model index reuse and overlap plausibility")
    if (/safe-linking|safe linking/i.test(afterText) && !/safe-linking|safe linking/i.test(beforeText))
      clues.push("safe-linking clue appears after sequence: do not force poisoning without leak/key strategy")
    if (/unsorted|main_arena|libc leak/i.test(afterText) && !/unsorted|main_arena|libc leak/i.test(beforeText))
      clues.push(
        "new libc/arena leak clue appeared after sequence: prioritize classification before further heap mutation",
      )

    const nextQuestions = [
      "Which index or chunk lifetime changed between the two states?",
      "Did a show/read path begin exposing pointers or metadata only after a free/realloc sequence?",
      "Did edit/write become possible on a freed or reallocated object?",
      "Does the changed state shorten a leak-first route more than a direct corruption route?",
    ]

    return [
      "pwn_heap_state_diff:",
      `before_ops: ${beforeOps.length}`,
      `after_ops: ${afterOps.length}`,
      "operation_deltas:",
      ...deltas.map((d) => `- ${d.kind}: before=${d.before} after=${d.after} delta=${d.delta}`),
      "clues:",
      ...(clues.length
        ? clues.map((c) => `- ${c}`)
        : ["- no strong lifecycle clue from op counts alone; inspect index/size-specific differences"]),
      "next_questions:",
      ...nextQuestions.map((q) => `- ${q}`),
      "stop_rule:",
      "- Use this diff to reduce one lifecycle hypothesis at a time; do not jump to a named heap technique from operation churn alone.",
    ].join("\n")
  },
})
