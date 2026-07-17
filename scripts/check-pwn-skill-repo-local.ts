import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const DEFAULT_REPO = path.join(ROOT, "knowledge", "ljagiello-ctf-skills")
const DEFAULT_LOCAL_PWN = path.join(ROOT, "knowledge", "pwn")
const QUERY_SET = [
  "bundled libc first runtime lock wrong libc heap verification",
  "exact read size+1 menu desync contract sendafter sendlineafter",
  "glibc 2.27 fake stdout setcontext+53 short playbook",
]

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(md|txt|yml|yaml)$/i.test(name)) out.push(p)
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
  ).slice(0, 20)
}

function scoreFile(rel: string, text: string, termList: string[]) {
  const lower = text.toLowerCase()
  let score = 0
  for (const t of termList) {
    const count = lower.split(t).length - 1
    score += Math.min(count, 8) * (t.length >= 5 ? 3 : 1)
    if (rel.toLowerCase().includes(t)) score += 8
  }
  if (/knowledge\/pwn\//i.test(rel)) score += 22
  if (
    /bundled-libc-first|wrong-libc-anti-pattern|exact-read-contracts|glibc27-fake-stdout-shortplaybook|free_hook-setcontext-orw|seccomp-closure-router|runtime-closure-index/i.test(
      rel,
    )
  )
    score += 80
  return score
}

const files = [...walk(DEFAULT_REPO), ...walk(DEFAULT_LOCAL_PWN)].map((file) => ({
  rel: path.relative(ROOT, file).replace(/\\/g, "/"),
  text: readFileSync(file, "utf8"),
}))

for (const query of QUERY_SET) {
  const termList = terms(query)
  const hits = files
    .map((f) => ({ rel: f.rel, score: scoreFile(f.rel, f.text, termList) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
  console.log(`query: ${query}`)
  console.log(`hits: ${hits.map((h) => `${h.rel}(${h.score})`).join(" | ")}`)
}
