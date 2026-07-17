import { readFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

const __dirname = resolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = resolve(__dirname, "..")
const DEFAULT_INDEX = join(PLUGIN_ROOT, "knowledge", "lessons", "lessons.index.json")

type IndexedLesson = {
  id: string
  family: string
  title: string
  query_terms?: string[]
  suggested_control_action?: string
  budget_penalty?: string
  owner_flip_trigger?: string
  closure_owner_hint?: string
  related_pattern_queries?: string[]
  related_failure_signatures?: string[]
  related_owner_lessons?: string[]
  related_closure_lessons?: string[]
}

type LessonIndex = {
  meta: { version: number; generated_at: string }
  lessons: IndexedLesson[]
}

function baseTerms(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_+.#:-]+/i)
        .filter((x) => x.length >= 2),
    ),
  ).slice(0, 32)
}

export default tool({
  description:
    "Convert lesson-hit evidence into a compact decision-state modifier plan: penalties, owner flip pressure, closure-first bias, and control action hints.",
  args: {
    query: tool.schema.string().describe("Evidence/constraint query, not challenge title."),
    family: tool.schema
      .string()
      .optional()
      .describe("Optional lesson family: closure | owner | failure | anti-pattern | all."),
    indexPath: tool.schema.string().optional().describe("Optional lesson index path."),
    maxHits: tool.schema.number().optional().describe("Maximum lessons to consider. Default 3."),
  },
  async execute(args) {
    const indexPath = args.indexPath || DEFAULT_INDEX
    if (!existsSync(indexPath)) return "BLOCK: lesson index not found"
    const idx = JSON.parse(readFileSync(indexPath, "utf8")) as LessonIndex
    const terms = baseTerms(args.query)
    const family = (args.family || "all").toLowerCase()
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 3, 8))
    const hits = idx.lessons
      .filter((x) => family === "all" || x.family === family)
      .map((x) => {
        const hay = `${x.id} ${x.title} ${(x.query_terms || []).join(" ")}`.toLowerCase()
        let score = 0
        for (const t of terms) {
          if (hay.includes(t)) score += t.length >= 5 ? 3 : 1
        }
        if (family !== "all" && x.family === family) score += 8
        return { lesson: x, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxHits)

    const controlActions = Array.from(new Set(hits.map((x) => x.lesson.suggested_control_action).filter(Boolean)))
    const budgetPenalties = Array.from(new Set(hits.map((x) => x.lesson.budget_penalty).filter(Boolean)))
    const ownerFlipTriggers = Array.from(new Set(hits.map((x) => x.lesson.owner_flip_trigger).filter(Boolean)))
    const closureOwnerHints = Array.from(new Set(hits.map((x) => x.lesson.closure_owner_hint).filter(Boolean)))
    const relatedPatternQueries = Array.from(new Set(hits.flatMap((x) => x.lesson.related_pattern_queries || [])))
    const relatedFailures = Array.from(new Set(hits.flatMap((x) => x.lesson.related_failure_signatures || [])))

    let rankingBias = "none"
    if (family === "closure") rankingBias = "increase closure-first bias; prefer direct closure probes over discovery"
    else if (family === "owner") rankingBias = "reduce current owner confidence unless handoff is checked"
    else if (family === "failure") rankingBias = "apply branch penalty and pivot pressure"
    else if (family === "anti-pattern") rankingBias = "demote strategically weak family and require promotion trigger"

    return [
      `query: ${args.query}`,
      `family: ${family}`,
      `index_version: ${idx.meta.version}`,
      `index_generated_at: ${idx.meta.generated_at}`,
      `hits: ${hits.length}`,
      "matched_lessons:",
      ...(hits.length
        ? hits.map(
            (x, i) =>
              `- #${i + 1} score=${x.score} id=${x.lesson.id} family=${x.lesson.family} action=${x.lesson.suggested_control_action || "none"}`,
          )
        : ["- none"]),
      "modifier_plan:",
      `- suggested_control_actions: ${controlActions.join(" | ") || "none"}`,
      `- budget_penalties: ${budgetPenalties.join(" | ") || "none"}`,
      `- owner_flip_triggers: ${ownerFlipTriggers.join(" | ") || "none"}`,
      `- closure_owner_hints: ${closureOwnerHints.join(" | ") || "none"}`,
      `- related_pattern_queries: ${relatedPatternQueries.join(" | ") || "none"}`,
      `- related_failure_signatures: ${relatedFailures.join(" | ") || "none"}`,
      `- ranking_bias: ${rankingBias}`,
      "decision_state_contract:",
      "- Copy budget penalties into hypothesis notes or gate evidence when relevant.",
      "- If owner_flip_triggers are non-empty, evaluate owner handoff before another same-family probe.",
      "- If closure_owner_hints are non-empty, prefer closure-first summaries with explicit closure owner.",
      "- If no hits are strong, fall back to ctf-pattern-card-search or manual ranking.",
    ].join("\n")
  },
})
