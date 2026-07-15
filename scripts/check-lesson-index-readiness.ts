import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

type LessonIndex = {
  meta?: {
    version?: number
    generated_at?: string
    source_dir?: string
  }
  lessons?: Array<{
    id?: string
    file?: string
    family?: string
    title?: string
    triggers?: string[]
    signals?: string[]
    better_question?: string
    stop_rule?: string
    query_terms?: string[]
  }>
}

function main() {
  const indexPath = resolve("knowledge", "lessons", "lessons.index.json")
  if (!existsSync(indexPath)) {
    console.log(`MISSING: ${indexPath}`)
    process.exit(1)
  }

  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as LessonIndex
  const lessons = parsed.lessons ?? []
  const weak = lessons.filter((lesson) => {
    return !lesson.id || !lesson.file || !lesson.family || !lesson.title || !lesson.triggers?.length || !lesson.signals?.length || !lesson.better_question || !lesson.stop_rule || !lesson.query_terms?.length
  })

  console.log("# Lesson Index Readiness\n")
  console.log(`- index_path: ${indexPath}`)
  console.log(`- lesson_count: ${lessons.length}`)
  console.log(`- version: ${parsed.meta?.version ?? "unknown"}`)
  console.log(`- generated_at: ${parsed.meta?.generated_at ?? "unknown"}`)
  console.log(`- weak_entries: ${weak.length}`)

  if (weak.length > 0) {
    console.log("\nweak_entry_ids:")
    for (const lesson of weak.slice(0, 20)) {
      console.log(`- ${lesson.id ?? lesson.file ?? "unknown"}`)
    }
    process.exit(1)
  }
}

main()
