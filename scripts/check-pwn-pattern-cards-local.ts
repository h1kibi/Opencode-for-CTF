import { readFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const IDX = path.join(ROOT, "knowledge", "pattern-cards", "pwn-curated.cards.v1.json")
const QUERY_SET = [
  "bundled libc first runtime lock wrong libc heap verification",
  "exact read size+1 menu desync contract sendafter sendlineafter",
  "glibc 2.27 fake stdout setcontext+53 short playbook",
]

type Card = {
  id: string
  source: string
  title: string
  trigger: string
  query_aliases?: string[]
  semantic_tokens?: string[]
  retrieval_intents?: string[]
  rank_boost?: number
}

function terms(query: string) {
  return Array.from(new Set(query.toLowerCase().split(/[^a-z0-9_+.#:-]+/i).filter((x) => x.length >= 2))).slice(0, 20)
}

function score(card: Card, query: string) {
  const originalTerms = terms(query)
  const hay = `${card.title} ${(card.query_aliases || []).join(" ")} ${(card.semantic_tokens || []).join(" ")} ${(card.retrieval_intents || []).join(" ")} ${card.trigger}`.toLowerCase()
  let s = 0
  for (const t of originalTerms) {
    const count = hay.split(t).length - 1
    s += Math.min(count, 8) * (t.length >= 5 ? 3 : 1)
  }
  if (card.source === "local-pwn-curated") s += 420
  const aliases = [card.title, ...(card.query_aliases || []), ...(card.retrieval_intents || []), ...(card.semantic_tokens || [])].map((x) => String(x).toLowerCase())
  const q = query.toLowerCase()
  if (aliases.some((alias) => alias && q.includes(alias))) s += 1400
  if (aliases.some((alias) => alias && alias.includes(q))) s += 900
  s += card.rank_boost || 0
  return s
}

const cards = (JSON.parse(readFileSync(IDX, "utf8")) as { cards: Card[] }).cards
for (const query of QUERY_SET) {
  const hits = cards.map((card) => ({ id: card.id, title: card.title, score: score(card, query) })).sort((a, b) => b.score - a.score).slice(0, 5)
  console.log(`query: ${query}`)
  console.log(`hits: ${hits.map((h) => `${h.id}:${h.title}(${h.score})`).join(" | ")}`)
}
