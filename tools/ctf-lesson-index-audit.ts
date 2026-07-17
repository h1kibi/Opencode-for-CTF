import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

const __dirname = resolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = resolve(__dirname, "..")
const DEFAULT_LESSON_DIR = join(PLUGIN_ROOT, "lessons")
const DEFAULT_INDEX = join(PLUGIN_ROOT, "knowledge", "lessons", "lessons.index.json")

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
}

type LessonIndex = { meta: Record<string, unknown>; lessons: IndexedLesson[] }

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

function familyOf(name: string) {
  const n = name.toLowerCase()
  if (n.startsWith("closure-")) return "closure"
  if (n.startsWith("failure-")) return "failure"
  if (n.startsWith("anti-pattern-")) return "anti-pattern"
  if (n.startsWith("owner-")) return "owner"
  const i = n.indexOf("-")
  return i > 0 ? n.slice(0, i) : "misc"
}

export default tool({
  description: "Audit structured lesson index coverage and report missing or weakly-structured local CTF lessons.",
  args: {
    lessonDir: tool.schema.string().optional().describe("Optional lesson directory path."),
    indexPath: tool.schema.string().optional().describe("Optional lesson index path."),
  },
  async execute(args) {
    const lessonDir = args.lessonDir || DEFAULT_LESSON_DIR
    const indexPath = args.indexPath || DEFAULT_INDEX
    const files = walk(lessonDir)
    const idx = existsSync(indexPath)
      ? (JSON.parse(readFileSync(indexPath, "utf8")) as LessonIndex)
      : { meta: {}, lessons: [] }
    const indexDir = dirname(resolve(indexPath))
    const byFile = new Map(idx.lessons.map((x) => [resolve(indexDir, x.file).toLowerCase(), x]))
    const missing = files.filter((f) => !byFile.has(f.toLowerCase()))
    const weak = idx.lessons.filter(
      (x) => !x.triggers?.length || !x.signals?.length || !x.better_question || !x.stop_rule || !x.query_terms?.length,
    )
    return [
      `verdict: lesson_index_audit`,
      `lesson_dir: ${lessonDir}`,
      `index_path: ${indexPath}`,
      `lesson_files: ${files.length}`,
      `indexed_lessons: ${idx.lessons.length}`,
      `missing_from_index: ${missing.length}`,
      `weak_index_entries: ${weak.length}`,
      `families_seen: ${Array.from(new Set(files.map((f) => familyOf(basename(f))))).join(" | ")}`,
      "missing_lessons:",
      ...(missing.length ? missing.map((x) => `- ${x}`) : ["- none"]),
      "weak_entries:",
      ...(weak.length
        ? weak.map(
            (x) =>
              `- ${x.id} file=${x.file} missing=${[!x.triggers?.length ? "triggers" : "", !x.signals?.length ? "signals" : "", !x.better_question ? "better_question" : "", !x.stop_rule ? "stop_rule" : "", !x.query_terms?.length ? "query_terms" : ""].filter(Boolean).join("|")}`,
          )
        : ["- none"]),
      "next_actions:",
      "- Add missing lessons to lessons.index.json.",
      "- Fill weak entries with triggers, signals, better_question, stop_rule, and query_terms.",
      "- Prefer indexing owner/failure/anti-pattern lessons that affect queue ranking or budget first.",
    ].join("\n")
  },
})
