import { readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

const __dirname = resolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = resolve(__dirname, "..")
const DEFAULT_INDEX = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "ljagiello-ctf-skills.cards.v9.json")
const DEFAULT_EXTRA_INDEX = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "java-web", "java-web.cards.v1.json")
const DEFAULT_PWN_CURATED_INDEX = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "pwn-curated.cards.v1.json")
const DEFAULT_SYNONYMS = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "synonyms.json")

type Card = {
  id: string
  source: string
  source_file: string
  category: string
  title: string
  kind: string
  trigger: string
  first_safe_check: string
  oracle: string
  stop_rule: string
  pivot_rule: string
  keywords: string[]
  snippet: string
  quality?: number
  specificity?: number
  curated?: boolean
  preconditions?: string[]
  confirm?: string
  falsify?: string
  next_tools?: string[]
  execution_plan?: string[]
  failure_modes?: string[]
  rank_boost?: number
  promoted?: boolean
  feedback?: Record<string, unknown>
  subfamily?: string
  precondition_signals?: string[]
  probe_template?: string
  distilled?: boolean
  primary_subfamily?: string
  subfamilies?: string[]
  subfamily_confidence?: number
  concepts?: string[]
  retrieval_intents?: string[]
  query_aliases?: string[]
  coverage_score?: number
  curation_priority?: number
  semantic_tokens?: string[]
  curation_tier?: string
  review_recommendation?: string
  semi_curated?: boolean
  semantic_ngrams?: string[]
  evidence_phrases?: string[]
}

type Index = { meta: { cards: number; generated_at: string; source_repo: string; version?: number; curated_cards?: number; auto_cards?: number }; cards: Card[] }

function baseTerms(query: string) {
  return Array.from(new Set(query.toLowerCase().split(/[^a-z0-9_+.#:-]+/i).filter((x) => x.length >= 2))).slice(0, 28)
}

function phraseMatches(phrase: string, needle: string, terms: string[]) {
  const n = needle.toLowerCase().trim()
  if (!n) return false
  const nt = baseTerms(n)
  if (!nt.length) return false
  if (nt.length === 1) return terms.includes(nt[0])
  return new RegExp(`(^|[^a-z0-9_+.#:-])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9_+.#:-])`, "i").test(phrase)
}

function expandTerms(query: string, synonymsPath: string) {
  const terms = baseTerms(query)
  const phrase = query.toLowerCase()
  try {
    const syn = JSON.parse(readFileSync(synonymsPath, "utf8")) as Record<string, string[]>
    for (const [key, vals] of Object.entries(syn)) {
      const keyTerms = baseTerms(key)
      if (phraseMatches(phrase, key, terms) || keyTerms.some((t) => terms.includes(t))) {
        for (const v of vals) for (const t of baseTerms(v)) terms.push(t)
        for (const t of keyTerms) terms.push(t)
      }
      for (const v of vals) {
        if (phraseMatches(phrase, v, terms)) {
          for (const t of baseTerms(key)) terms.push(t)
          for (const t of baseTerms(v)) terms.push(t)
        }
      }
    }
  } catch {}
  return Array.from(new Set(terms)).slice(0, 80)
}

function score(card: Card, termList: string[], originalTerms: string[], rawQuery: string) {
  const hay = `${card.category} ${card.primary_subfamily || ""} ${(card.subfamilies || []).join(" ")} ${(card.concepts || []).join(" ")} ${(card.retrieval_intents || []).join(" ")} ${(card.query_aliases || []).join(" ")} ${(card.semantic_tokens || []).join(" ")} ${(card.semantic_ngrams || []).join(" ")} ${(card.evidence_phrases || []).join(" ")} ${card.kind} ${card.title} ${card.trigger} ${card.keywords?.join(" ") || ""} ${card.snippet} ${card.first_safe_check} ${card.oracle} ${card.source_file}`.toLowerCase()
  let s = 0
  const queryLower = rawQuery.toLowerCase()
  const curatedPwnQuery = /(bundled\s+libc|wrong\s+libc|exact\s+read|size\+1|fake\s+stdout|setcontext\+53|seccomp\s+closure|runtime\s+lock|anti-pattern|menu\s+desync)/i.test(queryLower)
  for (const t of termList) {
    const exact = originalTerms.includes(t)
    const weight = exact ? 1.6 : 0.7
    if (card.category.toLowerCase() === t || card.kind.toLowerCase() === t || card.primary_subfamily === t || (card.subfamilies || []).includes(t) || (card.concepts || []).includes(t) || (card.retrieval_intents || []).includes(t) || (card.semantic_tokens || []).includes(t)) s += 20 * weight
    if (card.source_file.toLowerCase().includes(t)) s += 10 * weight
    if (card.title.toLowerCase().includes(t)) s += 10 * weight
    if ((card.keywords || []).includes(t)) s += 7 * weight
    const count = hay.split(t).length - 1
    s += Math.min(count, 8) * (t.length >= 5 ? 3 : 1) * weight
  }
  if (card.source === "local-java-web" || card.id.startsWith("java-")) s += 180
  if (card.source === "local-pwn-curated") s += curatedPwnQuery ? 420 : 260
  if (card.source === "local-pwn-curated") {
    const aliases = [card.title, ...(card.query_aliases || []), ...(card.retrieval_intents || []), ...(card.semantic_tokens || [])].map((x) => String(x).toLowerCase())
    if (aliases.some((alias) => alias && queryLower.includes(alias))) s += 1400
    if (aliases.some((alias) => alias && alias.includes(queryLower))) s += 900
  }
  if (originalTerms.includes("java-web") && ((card.semantic_tokens || []).includes("java-web") || (card.subfamilies || []).includes("java-web"))) s += 260
  if ((originalTerms.includes("bundled") && originalTerms.includes("libc")) || originalTerms.includes("wrong") || originalTerms.includes("setcontext+53") || originalTerms.includes("size+1") || (originalTerms.includes("exact") && originalTerms.includes("read"))) {
    if (card.source === "local-pwn-curated") s += 240
  }
  if (originalTerms.includes("java") && originalTerms.includes("web") && ((card.semantic_tokens || []).includes("java-web") || (card.subfamilies || []).includes("java-web"))) s += 120
  s += (card.quality ?? 3) * 3
  s += (card.specificity ?? 3) * 2
  s += card.rank_boost ?? 0
  if (card.curated) s += 35
  if (card.semi_curated) s += 18
  s += card.coverage_score ?? 0
  s += Math.round((card.curation_priority ?? 0) / 2)
  if (/workflow|pivot|technique/.test(card.kind)) s += 4
  return Math.round(s)
}

function desiredKindFilter(kind?: string) {
  const k = (kind || "all").trim().toLowerCase()
  if (k === "all") return ""
  return k
}

function loadIndexWithExtras(indexPath: string) {
  const idx = JSON.parse(readFileSync(indexPath, "utf8")) as Index
  if (indexPath === DEFAULT_INDEX) {
    try {
      const extra = JSON.parse(readFileSync(DEFAULT_EXTRA_INDEX, "utf8")) as Index
      idx.cards = [...extra.cards, ...idx.cards]
      idx.meta = {
        ...idx.meta,
        cards: idx.cards.length,
        curated_cards: (idx.meta.curated_cards ?? 0) + (extra.meta.curated_cards ?? extra.cards.length),
        source_repo: `${idx.meta.source_repo}+local-java-web`,
      }
    } catch {}
    try {
      const pwnExtra = JSON.parse(readFileSync(DEFAULT_PWN_CURATED_INDEX, "utf8")) as Index
      idx.cards = [...pwnExtra.cards, ...idx.cards]
      idx.meta = {
        ...idx.meta,
        cards: idx.cards.length,
        curated_cards: (idx.meta.curated_cards ?? 0) + (pwnExtra.meta.curated_cards ?? pwnExtra.cards.length),
        source_repo: `${idx.meta.source_repo}+local-java-web+local-pwn-curated`,
      }
    } catch {}
  }
  return idx
}

export default tool({
  description: "Search enhanced offline pattern cards extracted from ljagiello/ctf-skills plus curated high-value CTF cards. Uses synonym expansion, quality/specificity ranking, and returns decision-ready hypothesis seeds.",
  args: {
    query: tool.schema.string().describe("Evidence/constraint query, not challenge title. Example: 'web include file_get_contents parser mismatch filter'."),
    category: tool.schema.string().optional().describe("Optional category: web | pwn | crypto | reverse | forensics | misc | all."),
    kind: tool.schema.string().optional().describe("Optional kind: technique | workflow | pivot | quick-check | note | all."),
    maxHits: tool.schema.number().optional().describe("Maximum hits. Default 8, hard cap 20."),
    indexPath: tool.schema.string().optional().describe("Optional pattern card index path."),
    synonymsPath: tool.schema.string().optional().describe("Optional synonyms JSON path."),
  },
  async execute(args) {
    const indexPath = args.indexPath || DEFAULT_INDEX
    const synonymsPath = args.synonymsPath || DEFAULT_SYNONYMS
    const idx = loadIndexWithExtras(indexPath)
    const originalTerms = baseTerms(args.query)
    const termList = expandTerms(args.query, synonymsPath)
    if (!originalTerms.length) return "BLOCK: query needs evidence terms"
    const category = (args.category || "all").toLowerCase()
    const kind = desiredKindFilter(args.kind)
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 8, 20))
    const hits = idx.cards
      .filter((card) => category === "all" || !category || card.category === category)
      .filter((card) => !kind || card.kind === kind)
      .map((card) => ({ card, score: score(card, termList, originalTerms, args.query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxHits)
    return [
      `query: ${args.query}`,
      `expanded_terms: ${termList.slice(0, 30).join(" | ")}`,
      `category: ${category}`,
      `kind: ${kind || "all"}`,
      `index_cards: ${idx.meta.cards}`,
      `curated_cards: ${idx.meta.curated_cards ?? "unknown"}`,
      `index_version: ${idx.meta.version ?? 1}`,
      `index_generated_at: ${idx.meta.generated_at}`,
      `verdict: enhanced_offline_pattern_card_recall`,
      `hits: ${hits.length}`,
      "cards:",
      ...(hits.length
        ? hits.map(({ card, score }, i) => [
            `- #${i + 1} score=${score} category=${card.category} primary_subfamily=${card.primary_subfamily || card.subfamily || "?"} subfamilies=${(card.subfamilies || []).join("|") || card.subfamily || "?"} confidence=${card.subfamily_confidence ?? "?"} kind=${card.kind} quality=${card.quality ?? "?"} specificity=${card.specificity ?? "?"} curated=${card.curated ? "yes" : "no"} semi_curated=${card.semi_curated ? "yes" : "no"} promoted=${card.promoted ? "yes" : "no"} distilled=${card.distilled ? "yes" : "no"}`,
            `  id: ${card.id}`,
            `  concepts: ${(card.concepts || []).join(" | ") || "none"}`,
            `  retrieval_intents: ${(card.retrieval_intents || []).join(" | ") || "none"}`,
            `  query_aliases: ${(card.query_aliases || []).join(" | ") || "none"}`,
            `  coverage_score: ${card.coverage_score ?? "?"} curation_priority=${card.curation_priority ?? "?"} curation_tier=${card.curation_tier || "?"}`,
            `  review_recommendation: ${card.review_recommendation || "none"}`,
            `  semantic_tokens: ${(card.semantic_tokens || []).slice(0, 28).join(" | ") || "none"}`,
            `  evidence_phrases: ${(card.evidence_phrases || []).slice(0, 14).join(" | ") || "none"}`,
            `  source_file: ${card.source_file}`,
            `  title: ${card.title}`,
            `  trigger: ${card.trigger}`,
            `  preconditions: ${(card.preconditions || []).join(" | ") || "evidence supports this pattern"}`,
            `  precondition_signals: ${(card.precondition_signals || []).join(" | ") || "none"}`,
            `  probe_template: ${card.probe_template || card.first_safe_check}`,
            `  first_safe_check: ${card.first_safe_check}`,
            `  oracle: ${card.oracle}`,
            `  confirm: ${card.confirm || "first safe check yields expected oracle"}`,
            `  falsify: ${card.falsify || "first safe check fails under controlled conditions"}`,
            `  stop_rule: ${card.stop_rule}`,
            `  pivot_rule: ${card.pivot_rule}`,
            `  next_tools: ${(card.next_tools || []).join(" | ") || "none"}`,
            `  execution_plan: ${(card.execution_plan || []).join(" -> ") || "run first safe check"}`,
            `  failure_modes: ${(card.failure_modes || []).join(" | ") || "continuing without new differential"}`,
            `  snippet: ${(card.snippet || card.trigger).replace(/\s+/g, " ").slice(0, 320)}`,
          ].join("\n"))
        : ["- none"]),
      "decision_contract:",
      "- Pick at most one top card as the next hypothesis seed.",
      "- Use ctf-pattern-to-hypothesis to convert it into a ctf-decision-state hypothesis/probe.",
      "- Run exactly the first_safe_check or derive one one-variable probe from it.",
      "- Feed the observation to ctf-decision-state; do not chain multiple cards without evidence.",
      "- If cards are weak, fall back to ctf-skill-repo-search full-text search.",
    ].join("\n")
  },
})
