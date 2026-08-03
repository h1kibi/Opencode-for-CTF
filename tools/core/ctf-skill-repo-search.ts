import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"
import { ljagielloSkillsDir, secknowledgeSkillsDir, skillsPwnDir } from "../../src/asset-paths.ts"
import { formatEvidenceQueryBlock, validateEvidenceQuery } from "../lib/evidence-query.ts"

const DEFAULT_EXTERNAL_REPO = secknowledgeSkillsDir()
const DEFAULT_REPO = ljagielloSkillsDir()
const DEFAULT_LOCAL_PWN = skillsPwnDir()

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
  if (c === "ai") return "ai-ml"
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
  if (/(^|\/)(rag\/knowledge|knowledge)\/pwn\//i.test(rel)) score += 22
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
  if (r.startsWith("rag/knowledge/pwn/") || r.startsWith("knowledge/pwn/") || r.startsWith("pwn/")) return "pwn"
  if (r.startsWith("ctf-web/") || /(^|\/)web-[^/]+/i.test(r)) return "web"
  if (r.startsWith("ctf-pwn/") || /(^|\/)pwn-[^/]+/i.test(r)) return "pwn"
  if (r.startsWith("ctf-crypto/") || /(^|\/)crypto-[^/]+/i.test(r)) return "crypto"
  if (r.startsWith("ctf-reverse/") || /(^|\/)(reverse|rev)-[^/]+/i.test(r)) return "reverse"
  if (r.startsWith("ctf-forensics/") || /(^|\/)forensics?-[^/]+/i.test(r)) return "forensics"
  if (r.startsWith("ctf-misc/") || /(^|\/)misc-[^/]+/i.test(r)) return "misc"
  if (/(^|\/)ai-[^/]+/i.test(r)) return "ai-ml"
  return "general"
}

export default tool({
  description:
    "Search the pinned SecKnowledge reference mirror plus local curated knowledge for CTF technique patterns and bounded decision hints. Use for pattern recall, not answer lookup.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Evidence-based pattern query, e.g. 'file_get_contents include parser mismatch' or 'RSA small e broadcast'.",
      ),
    category: tool.schema
      .string()
      .optional()
      .describe("Optional category filter: web | pwn | crypto | reverse | forensics | misc | ai-ml | all."),
    maxHits: tool.schema.number().optional().describe("Maximum hits. Default 8, hard cap 20."),
    repoPath: tool.schema
      .string()
      .optional()
      .describe("Optional local reference mirror path. Defaults to SecKnowledge (or the legacy mirror if absent) plus local rag/knowledge/pwn cards."),
  },
  async execute(args) {
    const queryCheck = validateEvidenceQuery(args.query)
    if (!queryCheck.ok) return formatEvidenceQueryBlock(args.query, queryCheck)
    const repo = args.repoPath || DEFAULT_REPO
    const configuredRoots = args.repoPath
      ? Array.from(new Set([repo, DEFAULT_LOCAL_PWN]))
      : Array.from(new Set([DEFAULT_REPO, DEFAULT_EXTERNAL_REPO, DEFAULT_LOCAL_PWN]))
    const roots = configuredRoots.filter((root) => existsSync(root))
    const unavailableRoots = configuredRoots.filter((root) => !existsSync(root))
    const filter = categoryFilter(args.category)
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 8, 20))
    const termList = terms(args.query)
    if (!termList.length) return "BLOCK: query needs at least one useful term"
    const files = roots
      .flatMap((root) => walk(root).map((file) => ({ root, file })))
      .filter(({ root, file }) => {
        const rel = path.relative(root, file).replace(/\\/g, "/")
        const namespaced = root === DEFAULT_LOCAL_PWN ? `rag/knowledge/pwn/${rel}` : rel
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
        const namespaced = root === DEFAULT_LOCAL_PWN ? `rag/knowledge/pwn/${rel}` : rel
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
      `reference_repo: ${DEFAULT_EXTERNAL_REPO}`,
      `extra_repo: ${DEFAULT_LOCAL_PWN}`,
      `roots_available: ${roots.join(" | ") || "none"}`,
      `roots_unavailable: ${unavailableRoots.join(" | ") || "none"}`,
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
      "- Treat hits as pattern recall, not final answers or flag evidence.",
      "- Convert the best hit into trigger -> first_safe_check -> oracle -> stop_rule -> pivot_rule.",
      "- External notes can only create a hypothesis; local authorization, evidence, and flag-oracle rules override them.",
      "- If all hits are generic or no hit appears, return to ctf-experience-gate constraint equation.",
    ].join("\n")
  },
})
