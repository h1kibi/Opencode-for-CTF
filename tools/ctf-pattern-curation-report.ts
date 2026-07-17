import { readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

const __dirname = resolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = resolve(__dirname, "..")
const DEFAULT_INDEX = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "ljagiello-ctf-skills.cards.v9.json")
const DEFAULT_FEEDBACK = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "feedback.jsonl")

type Card = {
  id: string
  category: string
  title: string
  source_file: string
  curated?: boolean
  promoted?: boolean
  distilled?: boolean
  curation_priority?: number
  coverage_score?: number
  quality?: number
  specificity?: number
  concepts?: string[]
  subfamilies?: string[]
}
type Index = { meta: Record<string, unknown>; cards: Card[] }

function feedbackMap(path: string) {
  const m = new Map<string, { pos: number; neg: number; total: number }>()
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean)) {
      const f = JSON.parse(line)
      const cur = m.get(f.cardId) || { pos: 0, neg: 0, total: 0 }
      cur.total++
      if (["confirmed", "led_to_flag"].includes(f.result)) cur.pos++
      if (["misleading", "weak"].includes(f.result)) cur.neg++
      m.set(f.cardId, cur)
    }
  } catch {}
  return m
}

export default tool({
  description:
    "Report highest-priority CTF pattern cards to curate, promote, demote, or review using the v7 index and feedback log.",
  args: {
    category: tool.schema.string().optional().describe("Optional category filter."),
    maxItems: tool.schema.number().optional().describe("Maximum cards per section. Default 12."),
    indexPath: tool.schema.string().optional().describe("Optional v7 index path."),
    feedbackPath: tool.schema.string().optional().describe("Optional feedback JSONL path."),
  },
  async execute(args) {
    const idx = JSON.parse(readFileSync(args.indexPath || DEFAULT_INDEX, "utf8")) as Index
    const fb = feedbackMap(args.feedbackPath || DEFAULT_FEEDBACK)
    const cat = (args.category || "all").toLowerCase()
    const max = Math.max(1, Math.min(args.maxItems ?? 12, 40))
    const cards = idx.cards.filter((c) => cat === "all" || c.category === cat)
    const shouldCurate = cards
      .filter((c) => !c.curated && (c.curation_priority ?? 0) >= 28)
      .sort((a, b) => (b.curation_priority ?? 0) - (a.curation_priority ?? 0))
      .slice(0, max)
    const reviewWeak = cards
      .filter((c) => (fb.get(c.id)?.neg ?? 0) > 0)
      .sort((a, b) => (fb.get(b.id)?.neg ?? 0) - (fb.get(a.id)?.neg ?? 0))
      .slice(0, max)
    const promote = cards
      .filter((c) => (fb.get(c.id)?.pos ?? 0) > 0 || (c.distilled && !c.curated))
      .sort(
        (a, b) =>
          (fb.get(b.id)?.pos ?? 0) * 10 +
          (b.curation_priority ?? 0) -
          ((fb.get(a.id)?.pos ?? 0) * 10 + (a.curation_priority ?? 0)),
      )
      .slice(0, max)
    function fmt(c: Card) {
      const f = fb.get(c.id)
      return `- ${c.id} cat=${c.category} priority=${c.curation_priority ?? "?"} q=${c.quality ?? "?"} spec=${c.specificity ?? "?"} curated=${c.curated ? "yes" : "no"} distilled=${c.distilled ? "yes" : "no"} feedback=${f ? `+${f.pos}/-${f.neg}/n${f.total}` : "none"}\n  title: ${c.title}\n  source: ${c.source_file}\n  concepts: ${(c.concepts || []).join(" | ") || "none"}\n  subfamilies: ${(c.subfamilies || []).join(" | ") || "none"}`
    }
    return [
      `verdict: pattern_curation_report`,
      `index_version: ${idx.meta.version ?? "unknown"}`,
      `category: ${cat}`,
      `cards_considered: ${cards.length}`,
      "curate_next:",
      ...(shouldCurate.length ? shouldCurate.map(fmt) : ["- none"]),
      "promote_or_keep_high:",
      ...(promote.length ? promote.map(fmt) : ["- none"]),
      "review_demote_or_tighten:",
      ...(reviewWeak.length ? reviewWeak.map(fmt) : ["- none"]),
      "next_actions:",
      "- Convert curate_next items into curated-cards.json entries when repeatedly useful.",
      "- Tighten preconditions for weak/misleading cards.",
      "- Rebuild v7 after curation or feedback changes.",
    ].join("\n")
  },
})
