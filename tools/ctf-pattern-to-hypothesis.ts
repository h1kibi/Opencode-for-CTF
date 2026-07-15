import { readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

const __dirname = resolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = resolve(__dirname, "..")
const DEFAULT_INDEX = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "ljagiello-ctf-skills.cards.v9.json")
const DEFAULT_EXTRA_INDEX = join(PLUGIN_ROOT, "knowledge", "pattern-cards", "java-web", "java-web.cards.v1.json")

type Card = {
  id: string
  category: string
  kind: string
  title: string
  trigger: string
  first_safe_check: string
  oracle: string
  stop_rule: string
  pivot_rule: string
  source_file: string
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

type Index = { cards: Card[] }

function loadIndexWithExtras(indexPath: string) {
  const idx = JSON.parse(readFileSync(indexPath, "utf8")) as Index
  if (indexPath === DEFAULT_INDEX) {
    try {
      const extra = JSON.parse(readFileSync(DEFAULT_EXTRA_INDEX, "utf8")) as Index
      idx.cards = [...extra.cards, ...idx.cards]
    } catch {}
  }
  return idx
}

function family(card: Card) {
  return `${card.category}:${card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`
}

function value(card: Card) {
  const q = card.quality ?? 3
  const s = card.specificity ?? 3
  return Math.min(5, Math.max(1, Math.round((q + s) / 3)))
}

function confidence(card: Card, evidence: string) {
  const hay = `${card.title} ${card.trigger} ${card.preconditions?.join(" ") || ""}`.toLowerCase()
  const ev = evidence.toLowerCase().split(/[^a-z0-9_+.#:-]+/).filter((x) => x.length >= 3)
  const overlap = ev.filter((t) => hay.includes(t)).length
  return Math.min(5, Math.max(1, Math.round((overlap >= 5 ? 4 : overlap >= 3 ? 3 : overlap >= 1 ? 2 : 1) + (card.curated ? 1 : 0))))
}

function infoGain(card: Card) {
  if (/workflow|pivot/.test(card.kind)) return 4
  if (/differential|oracle|leak|parser|matrix|triage/.test(`${card.trigger} ${card.first_safe_check}`.toLowerCase())) return 5
  return 3
}

export default tool({
  description: "Convert an offline CTF pattern card into a ctf-decision-state hypothesis and probe contract. Use after ctf-pattern-card-search chooses one card.",
  args: {
    cardId: tool.schema.string().describe("Pattern card id from ctf-pattern-card-search."),
    evidence: tool.schema.string().describe("Current challenge evidence and constraint equation summary."),
    mode: tool.schema.string().optional().describe("direct | medium | hard. Default medium."),
    indexPath: tool.schema.string().optional().describe("Optional pattern card index path."),
  },
  async execute(args) {
    const idx = loadIndexWithExtras(args.indexPath || DEFAULT_INDEX)
    const card = idx.cards.find((c) => c.id === args.cardId)
    if (!card) return `BLOCK: pattern card not found: ${args.cardId}`
    const hypId = `pattern:${card.id.replace(/[^a-zA-Z0-9_.:-]/g, "_")}`
    const hyp = {
      id: hypId,
      family: family(card),
      primitive: card.title,
      subfamily: card.primary_subfamily || card.subfamily || card.kind,
      subfamilies: card.subfamilies || [card.subfamily || card.kind],
      subfamilyConfidence: card.subfamily_confidence ?? 0,
      concepts: card.concepts || [],
      retrievalIntents: card.retrieval_intents || [],
      queryAliases: card.query_aliases || [],
      evidencePhrases: card.evidence_phrases || [],
      semanticTokens: card.semantic_tokens || [],
      curationTier: card.curation_tier || "unknown",
      semiCurated: card.semi_curated || false,
      curationPriority: card.curation_priority ?? 0,
      reviewRecommendation: card.review_recommendation || "none",
      evidence: args.evidence,
      patternSource: card.source_file,
      value: Math.min(5, value(card) + Math.floor((card.rank_boost ?? 0) / 20)),
      confidence: confidence(card, args.evidence),
      infoGain: infoGain(card),
      cost: card.curated ? 1 : 2,
      risk: /write|bot|upload|race|destructive|kernel|privesc/i.test(card.trigger + card.first_safe_check) ? 3 : 1,
      stateDamage: /write|delete|upload|bot|race|mutate/i.test(card.trigger + card.first_safe_check) ? 3 : 1,
      stability: card.curated ? 4 : 3,
      state: "candidate",
      confirm: card.confirm || card.oracle,
      falsify: card.falsify || "first safe check produces no expected oracle under controlled conditions",
      stopRule: card.stop_rule,
      pivotRule: card.pivot_rule,
    }
    const probe = {
      hypothesisId: hypId,
      family: hyp.family,
      variable: "one evidence-backed input/action selected from the constraint equation",
      oneVariable: true,
      confirm: card.confirm || card.oracle,
      falsify: card.falsify || "no expected oracle/differential",
      distinguish: `Distinguish ${card.title} from adjacent families by observing: ${card.oracle}`,
      firstSafeCheck: card.first_safe_check,
      probeTemplate: card.probe_template || card.first_safe_check,
      subfamily: card.primary_subfamily || card.subfamily || card.kind,
      subfamilies: card.subfamilies || [card.subfamily || card.kind],
      subfamilyConfidence: card.subfamily_confidence ?? 0,
      preconditionSignals: card.precondition_signals || [],
      nextTools: card.next_tools || [],
      executionPlan: card.execution_plan || [],
      failureModes: card.failure_modes || [],
      preconditions: card.preconditions || [],
      sourceFile: card.source_file,
    }
    return [
      `verdict: pattern_to_hypothesis`,
      `mode: ${args.mode || "medium"}`,
      `card_id: ${card.id}`,
      `source_file: ${card.source_file}`,
      `subfamily: ${card.primary_subfamily || card.subfamily || card.kind}`,
      `subfamilies: ${(card.subfamilies || []).join(" | ") || card.subfamily || card.kind}`,
      `subfamily_confidence: ${card.subfamily_confidence ?? "n/a"}`,
      `concepts: ${(card.concepts || []).join(" | ") || "none"}`,
      `retrieval_intents: ${(card.retrieval_intents || []).join(" | ") || "none"}`,
      `curation_priority: ${card.curation_priority ?? "n/a"}`,
      `curation_tier: ${card.curation_tier || "unknown"}`,
      `semi_curated: ${card.semi_curated ? "yes" : "no"}`,
      `review_recommendation: ${card.review_recommendation || "none"}`,
      `distilled: ${card.distilled ? "yes" : "no"}`,
      `hypothesis_json: ${JSON.stringify(hyp)}`,
      `probe_contract_json: ${JSON.stringify(probe)}`,
      `next_tools: ${(card.next_tools || []).join(" | ") || "none"}`,
      "execution_plan:",
      ...((card.execution_plan || []).length ? (card.execution_plan || []).map((x) => `- ${x}`) : ["- Run the first safe check as one controlled probe."]),
      "failure_modes_to_avoid:",
      ...((card.failure_modes || []).length ? (card.failure_modes || []).map((x) => `- ${x}`) : ["- Continuing without a new differential."]),
      "next_steps:",
      "- Add hypothesis_json to ctf-decision-state rank/init input.",
      "- Use probe_contract_json before executing the first safe check.",
      "- After the probe, call ctf-decision-state observe with confirmed/falsified/newDifferential evidence.",
      "- Obey stopRule and pivotRule; do not chain another card without new evidence.",
    ].join("\n")
  },
})
