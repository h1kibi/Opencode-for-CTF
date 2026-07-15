import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs"
import { bootstrapEvidenceDir, getTargetPath, getTemplatePath } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  const target = process.argv[3] ?? ""

  if (!slug) {
    console.log("Usage: node scripts/init-rev-team-memory.ts <challenge-slug> [target]")
    process.exit(1)
  }

  const root = process.cwd()
  const outDir = bootstrapEvidenceDir(root, slug)
  const memoryPath = getTargetPath(root, slug, "rev-team-memory.json")
  const summaryPath = getTargetPath(root, slug, "rev-team-summary.md")

  if (!existsSync(memoryPath)) copyFileSync(getTemplatePath(root, "rev_team_memory.json"), memoryPath)
  if (!existsSync(summaryPath)) copyFileSync(getTemplatePath(root, "rev_team_summary.md"), summaryPath)

  const now = new Date().toISOString()
  const memory = JSON.parse(readFileSync(memoryPath, "utf8")) as Record<string, unknown>
  const challenge = {
    ...((memory.challenge as Record<string, unknown> | undefined) ?? {}),
    slug,
    target,
    category: "rev",
    created_at: (memory.challenge as Record<string, unknown> | undefined)?.created_at || now,
    updated_at: now,
  }
  memory.challenge = challenge
  writeFileSync(memoryPath, JSON.stringify(memory, null, 2) + "\n")

  console.log("# Initialized Rev Team memory\n")
  console.log(`- path: ${outDir}`)
  console.log(`- memory: ${memoryPath}`)
  console.log(`- summary: ${summaryPath}`)
}

main()
