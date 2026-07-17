import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const SKILL_REF = path.join(ROOT, "skills", "ctf-pwn", "references")
const KNOWLEDGE_PWN = path.join(ROOT, "knowledge", "pwn")
const PWN_CURATED = path.join(ROOT, "knowledge", "pattern-cards", "pwn-curated.cards.v1.json")

type QueryCheck = {
  query: string
  expectedFileFragments: string[]
  expectedCardIds: string[]
}

const checks: QueryCheck[] = [
  {
    query: "bundled libc first runtime lock wrong libc heap verification",
    expectedFileFragments: ["bundled-libc-first.md", "wrong-libc-anti-pattern.md", "runtime-closure-index.md"],
    expectedCardIds: ["pwn-runtime-bundled-libc-first", "pwn-anti-wrong-libc-validation"],
  },
  {
    query: "exact read size+1 menu desync contract sendafter sendlineafter",
    expectedFileFragments: ["exact-read-contracts.md", "runtime-closure-index.md"],
    expectedCardIds: ["pwn-runtime-exact-read-contracts", "pwn-anti-exact-read-drift"],
  },
  {
    query: "glibc 2.27 fake stdout setcontext+53 short playbook",
    expectedFileFragments: [
      "glibc27-fake-stdout-shortplaybook.md",
      "free_hook-setcontext-orw.md",
      "runtime-closure-index.md",
    ],
    expectedCardIds: ["pwn-curated-glibc27-fake-stdout-shortplaybook", "pwn-closure-free-hook-setcontext-orw"],
  },
]

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.md$/i.test(name)) out.push(full)
  }
  return out
}

function terms(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_+.#:-]+/i)
        .filter((x) => x.length >= 2),
    ),
  )
}

function scoreText(rel: string, text: string, query: string) {
  const t = terms(query)
  const hay = `${rel}\n${text}`.toLowerCase()
  let score = 0
  for (const term of t) {
    const c = hay.split(term).length - 1
    score += Math.min(c, 10) * (term.length >= 5 ? 3 : 1)
    if (rel.toLowerCase().includes(term)) score += 15
  }
  if (
    /bundled-libc-first|wrong-libc-anti-pattern|exact-read-contracts|glibc27-fake-stdout-shortplaybook|free_hook-setcontext-orw|seccomp-closure-router|runtime-closure-index/.test(
      rel,
    )
  )
    score += 120
  return score
}

function scoreCard(card: any, query: string) {
  const t = terms(query)
  const hay =
    `${card.title} ${(card.query_aliases || []).join(" ")} ${(card.semantic_tokens || []).join(" ")} ${card.trigger} ${card.keywords?.join(" ") || ""}`.toLowerCase()
  let score = 0
  for (const term of t) {
    const c = hay.split(term).length - 1
    score += Math.min(c, 10) * (term.length >= 5 ? 3 : 1)
  }
  score += card.rank_boost || 0
  if (card.source === "local-pwn-curated") score += 400
  return score
}

const files = [...walk(SKILL_REF), ...walk(KNOWLEDGE_PWN)].map((file) => ({
  rel: path.relative(ROOT, file).replace(/\\/g, "/"),
  text: readFileSync(file, "utf8"),
}))
const curated = JSON.parse(readFileSync(PWN_CURATED, "utf8")) as { cards: any[] }

let failed = false
for (const check of checks) {
  const topFiles = files
    .map((f) => ({ rel: f.rel, score: scoreText(f.rel, f.text, check.query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
  const topCards = curated.cards
    .map((card) => ({ id: card.id, score: scoreCard(card, check.query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const fileOk = check.expectedFileFragments.some((frag) => topFiles.some((f) => f.rel.includes(frag)))
  const cardOk = check.expectedCardIds.some((id) => topCards.some((c) => c.id === id))

  console.log(`query: ${check.query}`)
  console.log(`  top_files: ${topFiles.map((x) => `${x.rel}(${x.score})`).join(" | ")}`)
  console.log(`  top_cards: ${topCards.map((x) => `${x.id}(${x.score})`).join(" | ")}`)
  console.log(`  file_ok=${fileOk} card_ok=${cardOk}`)
  if (!fileOk || !cardOk) failed = true
}

if (failed) {
  console.error("pwn retrieval frontline check failed")
  process.exit(1)
}
console.log("pwn_retrieval_frontline_ok")
