import { tool } from "@opencode-ai/plugin"

type Entry = {
  line: string
  operation: string
  params: string[]
  evidence: string
}

function classify(line: string): Entry | null {
  const normalized = line.trim()
  if (!normalized) return null
  const cases: Array<{ re: RegExp; operation: string; params: string[]; evidence: string }> = [
    { re: /\b(add|alloc|create|new)\b/i, operation: "alloc", params: ["index?", "size?", "content?"], evidence: "allocation-like keyword" },
    { re: /\b(delete|free|remove|destroy|drop)\b/i, operation: "free", params: ["index?"], evidence: "free-like keyword" },
    { re: /\b(edit|update|write|set)\b/i, operation: "edit", params: ["index?", "content?", "size?"], evidence: "edit-like keyword" },
    { re: /\b(show|print|view|read|dump|display)\b/i, operation: "show", params: ["index?"], evidence: "readback-like keyword" },
    { re: /\b(exit|quit)\b/i, operation: "exit", params: [], evidence: "termination keyword" },
  ]
  for (const c of cases) if (c.re.test(normalized)) return { line: normalized, operation: c.operation, params: c.params, evidence: c.evidence }
  return null
}

export default tool({
  description: "CTF pwn heap menu map: turn observed menu lines or notes into a compact heap state table and first safe reduction questions.",
  args: {
    evidence: tool.schema.string().describe("Menu text, notes, source snippets, or operation names from a heap-style challenge."),
  },
  async execute(args) {
    const raw = args.evidence || ""
    if (raw.trim().length < 10) return "BLOCK: provide menu text, notes, or operation evidence"
    const entries = raw.split(/\r?\n/).map(classify).filter(Boolean) as Entry[]
    const byOp = new Map<string, Entry[]>()
    for (const e of entries) byOp.set(e.operation, [...(byOp.get(e.operation) || []), e])

    const operations = ["alloc", "free", "edit", "show", "exit"]
    const signals = [
      byOp.has("alloc") && byOp.has("free") ? "lifetime_control_present" : "",
      byOp.has("show") ? "leak_surface_possible" : "",
      byOp.has("edit") && byOp.has("free") ? "uaf_or_reuse_candidate" : "",
      byOp.has("alloc") && byOp.has("edit") ? "size_content_mismatch_candidate" : "",
    ].filter(Boolean)

    const firstQuestions = [
      "Does alloc ask for size, index, or both?",
      "Can freed indexes be reused or edited?",
      "Does show print raw content, pointers, or metadata?",
      "Are there count, length, or one-shot constraints?",
      "Which operation provides the cheapest leak oracle?",
    ]

    const primitiveQueue = [
      byOp.has("show") ? "show-path leak proof" : "find any readback oracle",
      byOp.has("edit") && byOp.has("free") ? "freed-object edit/UAF check" : "post-free state check",
      byOp.has("alloc") && byOp.has("free") ? "double-free / index reuse check" : "chunk lifecycle model",
      byOp.has("alloc") ? "size-boundary and off-by-one probe" : "input-surface recovery",
    ]

    return [
      "pwn_heap_menu_map:",
      `operations_detected: ${operations.filter((x) => byOp.has(x)).join(", ") || "none"}`,
      "operation_table:",
      ...operations.map((op) => byOp.has(op)
        ? `- ${op}: ${byOp.get(op)!.map((e) => `${e.line} [${e.params.join(", ")}]`).join(" | ")}`
        : `- ${op}: none`),
      "high_value_signals:",
      ...(signals.length ? signals.map((x) => `- ${x}`) : ["- none"]),
      "first_reduction_questions:",
      ...firstQuestions.map((x) => `- ${x}`),
      "primitive_queue:",
      ...primitiveQueue.map((x) => `- ${x}`),
      "stop_rule:",
      "- Do not choose a named heap technique until allocator version, menu lifecycle rules, and one concrete leak/write/UAF primitive are proven.",
    ].join("\n")
  },
})
