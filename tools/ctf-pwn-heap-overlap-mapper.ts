import { tool } from "@opencode-ai/plugin"

function parseNumberLike(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/_/g, "")
  if (/^0x[0-9a-f]+$/.test(cleaned)) return Number.parseInt(cleaned, 16)
  if (/^\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10)
  return NaN
}

function extractPairs(text: string) {
  const pairs: Array<{ left: string; right: string; offset: number }> = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/\b([A-Za-z0-9_.-]+)\s*(?:\+|offset\s*=?|@)\s*(0x[0-9a-f]+|\d+)\s*[:=]\s*([A-Za-z0-9_.-]+)\b/i)
    if (m) {
      const off = parseNumberLike(m[2])
      if (!Number.isNaN(off)) pairs.push({ left: m[1], right: m[3], offset: off })
      continue
    }
    const m2 = line.match(
      /\b(chunk[A-Za-z0-9_-]*)\b.*?\b(?:user(?:area)?|payload|data|field)\s*[:=]\s*(0x[0-9a-f]+|\d+)/i,
    )
    if (m2) {
      const off = parseNumberLike(m2[2])
      if (!Number.isNaN(off)) pairs.push({ left: m2[1], right: "user_area", offset: off })
    }
  }
  return pairs
}

function extractKeywords(text: string) {
  const hits = new Set<string>()
  const lower = text.toLowerCase()
  for (const key of [
    "next",
    "size",
    "fd",
    "bk",
    "fd_nextsize",
    "bk_nextsize",
    "prev_size",
    "header",
    "user",
    "payload",
    "name",
    "desc",
    "vtable",
    "ptr",
    "fd\x00",
    "safe-link",
    "tcache",
  ]) {
    if (lower.includes(key)) hits.add(key)
  }
  return Array.from(hits)
}

export default tool({
  description:
    "CTF PWN heap overlap field mapper: turn overlap notes, chunk layout text, or gdb output into a compact offset-to-field map and likely consumer hints.",
  args: {
    evidence: tool.schema
      .string()
      .describe("Heap layout notes, gdb output, overlap sketch, or source/decompilation snippet."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    const pairs = extractPairs(text)
    const keywords = extractKeywords(text)
    const recommendations = [
      pairs.length
        ? "Translate the strongest pair into one exact overwrite/read check before naming a technique."
        : "Write the overlap as chunkA_user_offset -> chunkB_field and rerun with one variable changed.",
      keywords.includes("fd") || keywords.includes("bk")
        ? "If fd/bk or tcache fields are in range, verify allocator version and safe-linking before poisoning."
        : "If no allocator metadata is visible, prove the overlap on user data first.",
      keywords.includes("vtable")
        ? "Treat the overlap as C++ object-field routing; confirm wrapper/inner object boundaries before FSOP or ROP."
        : "Keep the object-field consumer explicit: later consumer, later action, later overwrite target.",
    ]
    const payload = {
      schema_version: "pwn_heap_overlap_mapper.v1",
      pairs,
      keywords,
      recommendations,
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_heap_overlap_mapper:",
      "pairs:",
      ...(pairs.length ? pairs.map((p) => `- ${p.left} -> ${p.right} @ ${p.offset}`) : ["- none"]),
      "keywords:",
      ...(keywords.length ? keywords.map((x) => `- ${x}`) : ["- none"]),
      "recommendations:",
      ...recommendations.map((x) => `- ${x}`),
    ].join("\n")
  },
})
