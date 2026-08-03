import { existsSync, readFileSync } from "node:fs"
import { retrosIndexFile } from "../../src/asset-paths.ts"
import { tool } from "@opencode-ai/plugin"
import { formatEvidenceQueryBlock, validateEvidenceQuery } from "../lib/evidence-query.ts"

type RetroEntry = {
  id: string
  case_id?: string
  outcome?: string
  category?: string
  summary: string
  signals?: string[]
  successful_primitives?: string[]
  failed_families?: string[]
  missed_signals?: string[]
  route_ranking_lessons?: string[]
  stability_lessons?: string[]
  stop_rules?: string[]
  pivot_rules?: string[]
  query_terms?: string[]
  source_retro?: string
}

type RetroIndex = {
  schema_version: number
  generated_at?: string
  retros: RetroEntry[]
}

function terms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_+.#:-]+/i)
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, 32)
}

function scoreRetro(retro: RetroEntry, queryTerms: string[]): { score: number; reasons: string[] } {
  const title = `${retro.id} ${retro.case_id ?? ""}`.toLowerCase()
  const hay = [
    retro.category,
    retro.outcome,
    retro.summary,
    ...(retro.signals ?? []),
    ...(retro.successful_primitives ?? []),
    ...(retro.failed_families ?? []),
    ...(retro.missed_signals ?? []),
    ...(retro.route_ranking_lessons ?? []),
    ...(retro.stability_lessons ?? []),
    ...(retro.stop_rules ?? []),
    ...(retro.pivot_rules ?? []),
    ...(retro.query_terms ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  let score = 0
  const reasons: string[] = []
  for (const term of queryTerms) {
    if (title.includes(term)) {
      score += 10
      reasons.push(`id:${term}`)
    }
    const count = hay.split(term).length - 1
    if (count > 0) {
      score += Math.min(count, 8) * (term.length >= 5 ? 3 : 1)
      reasons.push(`content:${term}x${Math.min(count, 8)}`)
    }
  }
  return { score, reasons: Array.from(new Set(reasons)).slice(0, 10) }
}

export default tool({
  description:
    "Search sanitized local CTF retros before Expert Phase 2 route selection. Call with current evidence constraints to recall route-ordering mistakes, missed closures, stability failures, and proven pivot rules.",
  args: {
    query: tool.schema.string().describe("Evidence/constraint query, never a challenge-title answer lookup."),
    category: tool.schema.string().optional().describe("Optional CTF category filter."),
    outcome: tool.schema.string().optional().describe("Optional solved | failed | exhausted filter."),
    maxHits: tool.schema.number().optional().describe("Maximum hits. Default 5, hard cap 20."),
    indexPath: tool.schema.string().optional().describe("Optional retro index path for tests or maintenance."),
  },
  async execute(args) {
    const queryCheck = validateEvidenceQuery(args.query)
    if (!queryCheck.ok) return formatEvidenceQueryBlock(args.query, queryCheck)
    const indexPath = args.indexPath ?? retrosIndexFile()
    if (!existsSync(indexPath)) return `BLOCK: retro index not found: ${indexPath}`
    const queryTerms = terms(args.query)
    if (!queryTerms.length) return "BLOCK: query needs evidence terms"
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as RetroIndex
    const category = (args.category ?? "all").toLowerCase()
    const outcome = (args.outcome ?? "all").toLowerCase()
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 5, 20))
    const hits = (index.retros ?? [])
      .filter((retro) => category === "all" || (retro.category ?? "").toLowerCase() === category)
      .filter((retro) => outcome === "all" || (retro.outcome ?? "").toLowerCase() === outcome)
      .map((retro) => ({ retro, ...scoreRetro(retro, queryTerms) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.retro.id.localeCompare(b.retro.id))
      .slice(0, maxHits)

    return [
      `query: ${args.query}`,
      `category: ${category}`,
      `outcome: ${outcome}`,
      `index_path: ${indexPath}`,
      `index_version: ${index.schema_version}`,
      `retros_indexed: ${(index.retros ?? []).length}`,
      `hits: ${hits.length}`,
      "retros:",
      ...(hits.length
        ? hits.map(
            ({ retro, score, reasons }, i) =>
              `- #${i + 1} score=${score} id=${retro.id} category=${retro.category ?? "unknown"} outcome=${retro.outcome ?? "unknown"}\n  reasons: ${reasons.join(" | ")}\n  summary: ${retro.summary}\n  signals: ${(retro.signals ?? []).join(" | ") || "none"}\n  successful_primitives: ${(retro.successful_primitives ?? []).join(" | ") || "none"}\n  failed_families: ${(retro.failed_families ?? []).join(" | ") || "none"}\n  missed_signals: ${(retro.missed_signals ?? []).join(" | ") || "none"}\n  route_ranking_lessons: ${(retro.route_ranking_lessons ?? []).join(" | ") || "none"}\n  stability_lessons: ${(retro.stability_lessons ?? []).join(" | ") || "none"}\n  stop_rules: ${(retro.stop_rules ?? []).join(" | ") || "none"}\n  pivot_rules: ${(retro.pivot_rules ?? []).join(" | ") || "none"}\n  source_retro: ${retro.source_retro ?? "not packaged"}`,
          )
        : ["- none"]),
      "decision_contract:",
      "- A retro may change route order, owner, stability budget, closure priority, or a stop/pivot condition.",
      "- Never copy a prior answer or route solely because challenge titles look similar.",
      "- Live evidence overrides historical retros; record no-hit as a valid Phase 2 recall result.",
    ].join("\n")
  },
})
