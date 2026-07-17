import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path, { resolve as pathResolve } from "node:path"
import { tool } from "@opencode-ai/plugin"

const __dirname = pathResolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = pathResolve(__dirname, "..")
const DEFAULT_REPO = path.join(PLUGIN_ROOT, "knowledge", "ljagiello-ctf-skills")
const DEFAULT_LOCAL_PWN = path.join(PLUGIN_ROOT, "knowledge", "pwn")

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

function categoryFilter(category?: string) {
  const c = (category || "all").toLowerCase()
  if (c === "all") return ""
  if (["web", "pwn", "crypto", "reverse", "forensics", "misc", "ai-ml", "malware", "osint"].includes(c)) return c
  return c
}

function snippet(text: string, termList: string[]) {
  const lower = text.toLowerCase()
  let idx = -1
  for (const t of termList) {
    idx = lower.indexOf(t)
    if (idx >= 0) break
  }
  if (idx < 0) idx = 0
  const start = Math.max(0, idx - 260)
  const end = Math.min(text.length, idx + 520)
  return text.slice(start, end).replace(/\s+/g, " ").trim()
}

function headingsNear(text: string, index: number) {
  const before = text.slice(0, Math.max(0, index))
  return (
    before
      .split(/\r?\n/)
      .filter((line) => /^#{1,4}\s+/.test(line))
      .slice(-3)
      .join(" > ") || "top"
  )
}

function scoreFile(rel: string, text: string, termList: string[]) {
  const lower = text.toLowerCase()
  let score = 0
  for (const t of termList) {
    const count = lower.split(t).length - 1
    score += Math.min(count, 8) * (t.length >= 5 ? 3 : 1)
    if (rel.toLowerCase().includes(t)) score += 8
  }
  if (/SKILL\.md$/i.test(rel)) score += 3
  if (/field-notes|advanced|patterns|server-side|client-side|auth|rsa|heap|rop|forensics|pyjails/i.test(rel)) score += 2
  if (/knowledge\/pwn\//i.test(rel)) score += 22
  if (
    /bundled-libc-first|wrong-libc-anti-pattern|exact-read-contracts|glibc27-fake-stdout-shortplaybook|free_hook-setcontext-orw|seccomp-closure-router|runtime-closure-index/i.test(
      rel,
    )
  )
    score += 80
  return score
}

function familyFromPath(rel: string) {
  const r = rel.replace(/\\/g, "/")
  if (r.startsWith("knowledge/pwn/") || r.startsWith("pwn/")) return "pwn"
  if (r.startsWith("ctf-web/")) return "web"
  if (r.startsWith("ctf-pwn/")) return "pwn"
  if (r.startsWith("ctf-crypto/")) return "crypto"
  if (r.startsWith("ctf-reverse/")) return "reverse"
  if (r.startsWith("ctf-forensics/")) return "forensics"
  if (r.startsWith("ctf-misc/")) return "misc"
  return "general"
}

export default tool({
  description:
    "Search the local mirror of ljagiello/ctf-skills plus local curated PWN cards for CTF technique patterns and decision hints. Use for pattern recall, not answer lookup.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Evidence-based pattern query, e.g. 'file_get_contents include parser mismatch' or 'RSA small e broadcast'.",
      ),
    category: tool.schema
      .string()
      .optional()
      .describe("Optional category filter: web | pwn | crypto | reverse | forensics | misc | all."),
    maxHits: tool.schema.number().optional().describe("Maximum hits. Default 8, hard cap 20."),
    repoPath: tool.schema
      .string()
      .optional()
      .describe("Optional local ctf-skills mirror path. Defaults to the mirror plus local knowledge/pwn cards."),
  },
  async execute(args) {
    const repo = args.repoPath || DEFAULT_REPO
    const normalizedRepo = repo.replace(/\\/g, "/").toLowerCase()
    const roots =
      normalizedRepo.endsWith("/knowledge") ||
      normalizedRepo ===
        DEFAULT_REPO.replace(/\\/g, "/")
          .toLowerCase()
          .replace(/\/knowledge\/ljagiello-ctf-skills$/, "/knowledge")
        ? [DEFAULT_REPO, DEFAULT_LOCAL_PWN]
        : Array.from(new Set([repo, DEFAULT_LOCAL_PWN]))
    const filter = categoryFilter(args.category)
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 8, 20))
    const termList = terms(args.query)
    if (!termList.length) return "BLOCK: query needs at least one useful term"
    const files = roots
      .flatMap((root) => walk(root).map((file) => ({ root, file })))
      .filter(({ root, file }) => {
        const rel = path.relative(root, file).replace(/\\/g, "/")
        const namespaced = root === DEFAULT_LOCAL_PWN ? `knowledge/pwn/${rel}` : rel
        return (
          !filter ||
          namespaced.startsWith(`${filter}/`) ||
          namespaced.startsWith(`ctf-${filter}/`) ||
          familyFromPath(namespaced) === filter
        )
      })
    const hits = files
      .map(({ root, file }) => {
        const rel = path.relative(root, file).replace(/\\/g, "/")
        const namespaced = root === DEFAULT_LOCAL_PWN ? `knowledge/pwn/${rel}` : rel
        const text = readFileSync(file, "utf8")
        const score = scoreFile(namespaced, text, termList)
        const lower = text.toLowerCase()
        let idx = -1
        for (const t of termList) {
          const i = lower.indexOf(t)
          if (i >= 0 && (idx < 0 || i < idx)) idx = i
        }
        return { rel: namespaced, score, idx, text }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxHits)

    const suggested = Array.from(new Set(hits.map((x) => familyFromPath(x.rel)))).filter(Boolean)
    return [
      `query: ${args.query}`,
      `category: ${args.category || "all"}`,
      `repo: ${repo}`,
      `extra_repo: ${DEFAULT_LOCAL_PWN}`,
      `verdict: ctf_skill_repo_pattern_recall`,
      `hits: ${hits.length}`,
      `suggested_families: ${suggested.length ? suggested.join(" | ") : "none"}`,
      "results:",
      ...(hits.length
        ? hits.map((h, i) => {
            const heading = h.idx >= 0 ? headingsNear(h.text, h.idx) : "top"
            return `- #${i + 1} ${h.rel} score=${h.score} family=${familyFromPath(h.rel)} heading=${heading}\n  snippet: ${snippet(h.text, termList)}`
          })
        : ["- none"]),
      "usage_contract:",
      "- Treat hits as pattern recall, not final answers.",
      "- Convert the best hit into one first safe check and one stop rule.",
      "- If all hits are generic or no hit appears, return to ctf-experience-gate constraint equation.",
    ].join("\n")
  },
})
