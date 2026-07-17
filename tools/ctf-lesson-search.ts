import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

const __dirname = resolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = resolve(__dirname, "..")
const DEFAULT_LESSON_DIR = join(PLUGIN_ROOT, "lessons")
const DEFAULT_INDEX = join(PLUGIN_ROOT, "knowledge", "lessons", "lessons.index.json")

type LessonHit = {
  file: string
  family: string
  score: number
  reasons: string[]
  preview: string
}

type IndexedLesson = {
  id: string
  file: string
  family: string
  category?: string
  title: string
  triggers?: string[]
  signals?: string[]
  better_question?: string
  stop_rule?: string
  promote_if?: string[]
  demote_if?: string[]
  query_terms?: string[]
  related_pattern_queries?: string[]
  related_failure_signatures?: string[]
  related_owner_lessons?: string[]
  related_closure_lessons?: string[]
  suggested_control_action?: string
  budget_penalty?: string
  owner_flip_trigger?: string
  closure_owner_hint?: string
}

type LessonIndex = {
  meta: { version: number; generated_at: string; source_dir: string; description?: string }
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

function familyOf(name: string) {
  if (name.startsWith("closure-")) return "closure"
  if (name.startsWith("failure-")) return "failure"
  if (name.startsWith("anti-pattern-")) return "anti-pattern"
  if (name.startsWith("owner-")) return "owner"
  const i = name.indexOf("-")
  return i > 0 ? name.slice(0, i) : "misc"
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (st.isFile() && entry.toLowerCase().endsWith(".md") && entry.toLowerCase() !== "readme.md") out.push(p)
  }
  return out
}

function scoreLesson(file: string, content: string, terms: string[], familyPref: string) {
  const name = basename(file).toLowerCase()
  const fam = familyOf(name)
  const text = `${name}\n${content}`.toLowerCase()
  let score = 0
  const reasons: string[] = []
  if (familyPref && familyPref !== "all" && fam === familyPref) {
    score += 20
    reasons.push(`family=${fam}`)
  }
  for (const t of terms) {
    if (name.includes(t)) {
      score += 8
      reasons.push(`name:${t}`)
    }
    const count = text.split(t).length - 1
    if (count > 0) {
      score += Math.min(count, 8) * (t.length >= 5 ? 3 : 1)
      reasons.push(`text:${t}x${Math.min(count, 8)}`)
    }
  }
  return { score, reasons, family: fam }
}

export default tool({
  description:
    "Search local CTF lessons (closure, owner handoff, failure signatures, anti-patterns) and return the best reusable decision units before broader pattern recall.",
  args: {
    query: tool.schema
      .string()
      .describe("Evidence/constraint query. Example: 'source leak closure admin route config env'."),
    family: tool.schema
      .string()
      .optional()
      .describe("Optional lesson family: closure | owner | failure | anti-pattern | all."),
    maxHits: tool.schema.number().optional().describe("Maximum hits. Default 6, hard cap 20."),
    lessonDir: tool.schema.string().optional().describe("Optional lesson directory path."),
    indexPath: tool.schema.string().optional().describe("Optional structured lesson index path."),
  },
  async execute(args) {
    const lessonDir = args.lessonDir || DEFAULT_LESSON_DIR
    const indexPath = args.indexPath || DEFAULT_INDEX
    const terms = baseTerms(args.query)
    const familyPref = (args.family || "all").toLowerCase()
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 6, 20))
    if (!terms.length) return "BLOCK: query needs evidence terms"
    if (existsSync(indexPath)) {
      const idx = JSON.parse(readFileSync(indexPath, "utf8")) as LessonIndex
      let hits = idx.lessons
        .filter((x) => familyPref === "all" || x.family === familyPref)
        .map((x) => {
          const hay =
            `${x.id} ${x.title} ${(x.triggers || []).join(" ")} ${(x.signals || []).join(" ")} ${(x.query_terms || []).join(" ")} ${x.better_question || ""} ${x.stop_rule || ""}`.toLowerCase()
          let score = 0
          const reasons: string[] = []
          if (familyPref !== "all" && x.family === familyPref) {
            score += 20
            reasons.push(`family=${x.family}`)
          }
          for (const t of terms) {
            if (x.id.toLowerCase().includes(t) || x.title.toLowerCase().includes(t)) {
              score += 8
              reasons.push(`name:${t}`)
            }
            const count = hay.split(t).length - 1
            if (count > 0) {
              score += Math.min(count, 8) * (t.length >= 5 ? 3 : 1)
              reasons.push(`index:${t}x${Math.min(count, 8)}`)
            }
          }
          const action =
            x.suggested_control_action ||
            (x.family === "closure"
              ? "CLOSE_OR_CONTINUE"
              : x.family === "owner"
                ? "OWNER"
                : x.family === "failure"
                  ? "LEDGER_OR_PIVOT"
                  : x.family === "anti-pattern"
                    ? "PIVOT_OR_DEMOTE"
                    : "CONTINUE")
          return {
            file: x.file,
            family: x.family,
            score,
            reasons: Array.from(new Set(reasons)).slice(0, 10),
            preview: [x.title, x.better_question || "", x.stop_rule || ""].filter(Boolean).join(" | "),
            action,
            relatedPatternQueries: x.related_pattern_queries || [],
            relatedFailures: x.related_failure_signatures || [],
            relatedOwners: x.related_owner_lessons || [],
            relatedClosures: x.related_closure_lessons || [],
            budgetPenalty: x.budget_penalty || "none",
            ownerFlipTrigger: x.owner_flip_trigger || "none",
            closureOwnerHint: x.closure_owner_hint || "none",
          }
        })
        .filter((x) => x.score > 0)
      try {
        const indexDir = dirname(resolve(indexPath))
        const indexedFiles = new Set(idx.lessons.map((x) => resolve(indexDir, x.file).toLowerCase()))
        for (const file of walk(lessonDir)) {
          if (indexedFiles.has(file.toLowerCase())) continue
          const content = readFileSync(file, "utf8")
          const { score, reasons, family } = scoreLesson(file, content, terms, familyPref)
          if (score <= 0) continue
          hits.push({
            file,
            family,
            score,
            reasons: Array.from(new Set(reasons)).slice(0, 10),
            preview: content.replace(/\s+/g, " ").slice(0, 260),
            action:
              family === "closure"
                ? "CLOSE_OR_CONTINUE"
                : family === "owner"
                  ? "OWNER"
                  : family === "failure"
                    ? "LEDGER_OR_PIVOT"
                    : family === "anti-pattern"
                      ? "PIVOT_OR_DEMOTE"
                      : "CONTINUE",
            relatedPatternQueries: [],
            relatedFailures: [],
            relatedOwners: [],
            relatedClosures: [],
            budgetPenalty: "none",
            ownerFlipTrigger: "none",
            closureOwnerHint: "none",
          })
        }
      } catch {}
      hits = hits.sort((a, b) => b.score - a.score).slice(0, maxHits)
      return [
        `query: ${args.query}`,
        `family: ${familyPref}`,
        `lesson_index: ${indexPath}`,
        `index_version: ${idx.meta.version}`,
        `index_generated_at: ${idx.meta.generated_at}`,
        `lessons_indexed: ${idx.lessons.length}`,
        `lesson_dir_extra_scan: ${lessonDir}`,
        `hits: ${hits.length}`,
        "lessons:",
        ...(hits.length
          ? hits.map(
              (h, i) =>
                `- #${i + 1} score=${h.score} family=${h.family} action=${h.action}\n  file: ${h.file}\n  reasons: ${h.reasons.join(" | ")}\n  preview: ${h.preview}\n  budget_penalty: ${h.budgetPenalty}\n  owner_flip_trigger: ${h.ownerFlipTrigger}\n  closure_owner_hint: ${h.closureOwnerHint}\n  related_pattern_queries: ${h.relatedPatternQueries.join(" | ") || "none"}\n  related_failure_signatures: ${h.relatedFailures.join(" | ") || "none"}\n  related_owner_lessons: ${h.relatedOwners.join(" | ") || "none"}\n  related_closure_lessons: ${h.relatedClosures.join(" | ") || "none"}`,
            )
          : ["- none"]),
        "decision_contract:",
        "- Prefer one matching lesson before broader pattern-card or repo recall when the branch is in closure-first, mixed-owner, stale, or anti-pattern territory.",
        "- A lesson must change queue ranking, budget, owner selection, or closure order; otherwise treat it as weak context.",
        "- Use the suggested action as the default control-plane move unless live evidence clearly overrides it.",
        "- If no lesson is strong enough, continue with ctf-pattern-card-search or ctf-skill-repo-search.",
      ].join("\n")
    }
    const files = walk(lessonDir)
    const hits: LessonHit[] = []
    for (const file of files) {
      const content = readFileSync(file, "utf8")
      const { score, reasons, family } = scoreLesson(file, content, terms, familyPref)
      if (score <= 0) continue
      const preview = content.replace(/\s+/g, " ").slice(0, 260)
      hits.push({ file, family, score, reasons: Array.from(new Set(reasons)).slice(0, 10), preview })
    }
    hits.sort((a, b) => b.score - a.score)
    const top = hits.slice(0, maxHits)
    return [
      `query: ${args.query}`,
      `family: ${familyPref}`,
      `lesson_dir: ${lessonDir}`,
      `lessons_scanned: ${files.length}`,
      `hits: ${top.length}`,
      "lessons:",
      ...(top.length
        ? top.map(
            (h, i) =>
              `- #${i + 1} score=${h.score} family=${h.family}\n  file: ${h.file}\n  reasons: ${h.reasons.join(" | ")}\n  preview: ${h.preview}`,
          )
        : ["- none"]),
      "decision_contract:",
      "- Prefer one matching lesson before broader pattern-card or repo recall when the branch is in closure-first, mixed-owner, stale, or anti-pattern territory.",
      "- A lesson must change queue ranking, budget, owner selection, or closure order; otherwise treat it as weak context.",
      "- If no lesson is strong enough, continue with ctf-pattern-card-search or ctf-skill-repo-search.",
    ].join("\n")
  },
})
