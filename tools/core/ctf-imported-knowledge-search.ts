import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"
import { desCtfKnowledgeRawDir, importedKnowledgeDir } from "../../src/asset-paths.ts"
import { formatEvidenceQueryBlock, validateEvidenceQuery } from "../lib/evidence-query.ts"

function terms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}_+.#:-]+/u)
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, 32)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue
    const full = path.join(dir, name)
    const info = statSync(full)
    if (info.isDirectory()) walk(full, out)
    else if (info.isFile() && /\.(md|txt|yml|yaml)$/i.test(name) && info.size <= 2 * 1024 * 1024) out.push(full)
  }
  return out
}

function score(rel: string, text: string, queryTerms: string[]): number {
  const hay = `${rel}\n${text}`.toLowerCase()
  let value = 0
  for (const term of queryTerms) {
    const count = hay.split(term).length - 1
    value += Math.min(count, 10) * (term.length >= 5 ? 3 : 1)
    if (rel.toLowerCase().includes(term)) value += 10
  }
  if (/AI-SEARCH-INDEX|PAYLOAD-CHEATSHEET|\.idx\.md$/i.test(rel)) value += 16
  return value
}

export default tool({
  description:
    "Search user-imported local CTF RAG mirrors when compact lessons, retros, and pattern cards are weak. Call with evidence constraints; unavailable mirrors return a structured no-hit result.",
  args: {
    query: tool.schema.string().describe("Evidence-based query, not an exact challenge-title answer lookup."),
    sourceId: tool.schema.string().optional().describe("Optional imported source ID, such as des-ctf-knowledge."),
    maxHits: tool.schema.number().optional().describe("Maximum hits. Default 6, hard cap 20."),
    rootPath: tool.schema.string().optional().describe("Optional imported knowledge root for tests."),
  },
  async execute(args) {
    const queryCheck = validateEvidenceQuery(args.query)
    if (!queryCheck.ok) return formatEvidenceQueryBlock(args.query, queryCheck)
    const root = args.rootPath ?? importedKnowledgeDir()
    const sourceId = args.sourceId?.trim()
    let searchRoot = sourceId ? path.join(root, sourceId) : root
    if (!existsSync(searchRoot) && sourceId === "des-ctf-knowledge" && !args.rootPath) {
      searchRoot = desCtfKnowledgeRawDir()
    }
    if (!existsSync(searchRoot)) {
      return [
        "verdict: imported_knowledge_unavailable",
        `root: ${searchRoot}`,
        "hits: 0",
        "next: continue with compact lessons/retros/pattern cards; do not fail the solve solely because the local mirror is absent.",
      ].join("\n")
    }
    const queryTerms = terms(args.query)
    if (!queryTerms.length) return "BLOCK: query needs evidence terms"
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 6, 20))
    const files = walk(searchRoot)
    const hits = files
      .map((file) => {
        const rel = path.relative(searchRoot, file).replace(/\\/g, "/")
        const text = readFileSync(file, "utf8")
        return { rel, text, score: score(rel, text, queryTerms) }
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel))
      .slice(0, maxHits)

    return [
      "verdict: imported_local_rag_recall",
      `query: ${args.query}`,
      `root: ${searchRoot}`,
      `files_scanned: ${files.length}`,
      `hits: ${hits.length}`,
      "results:",
      ...(hits.length
        ? hits.map(
            (hit, index) =>
              `- #${index + 1} score=${hit.score} file=${hit.rel}\n  snippet: ${hit.text.replace(/\s+/g, " ").slice(0, 420)}`,
          )
        : ["- none"]),
      "usage_contract:",
      "- Treat imported text as attributed pattern recall, not a final answer or live evidence.",
      "- Extract one safe probe and one stop rule; do not copy flags, credentials, or full third-party passages into solve state.",
    ].join("\n")
  },
})
