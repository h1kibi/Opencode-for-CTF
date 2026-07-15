import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs"
import { bootstrapEvidenceDir, getTargetPath, getTemplatePath, parsePatch } from "./evidence-helper.ts"

const APPEND_FIELDS = new Set([
  "assets",
  "confirmed_facts",
  "high_value_signals",
  "hypotheses",
  "closed_or_falsified_routes",
  "closure_candidates",
  "knowledge_hits",
  "team_tasks",
])

function mergeMemory(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    if (APPEND_FIELDS.has(key) && Array.isArray(value)) {
      const current = Array.isArray(merged[key]) ? (merged[key] as unknown[]) : []
      merged[key] = [...current, ...value]
      continue
    }

    if ((key === "challenge" || key === "next_action") && value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = {
        ...((merged[key] as Record<string, unknown> | undefined) ?? {}),
        ...(value as Record<string, unknown>),
      }
      continue
    }

    merged[key] = value
  }

  const now = new Date().toISOString()
  merged.challenge = {
    ...((merged.challenge as Record<string, unknown> | undefined) ?? {}),
    updated_at: now,
  }
  return merged
}

function main() {
  const slug = process.argv[2]
  let patchRaw = process.argv[3]

  if (!slug || !patchRaw) {
    console.log("Usage: node scripts/update-rev-team-memory.ts <challenge-slug> '<json-patch|key=value,...>'")
    process.exit(1)
  }

  // If the argument looks like a file path and exists, read it as the patch
  if (patchRaw.endsWith(".json") && existsSync(patchRaw)) {
    patchRaw = readFileSync(patchRaw, "utf8")
  }

  const root = process.cwd()
  bootstrapEvidenceDir(root, slug)
  const target = getTargetPath(root, slug, "rev-team-memory.json")
  if (!existsSync(target)) copyFileSync(getTemplatePath(root, "rev_team_memory.json"), target)

  const base = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>
  const patch = parsePatch(patchRaw)
  const merged = mergeMemory(base, patch)
  writeFileSync(target, JSON.stringify(merged, null, 2) + "\n")
  console.log(`Updated Rev Team memory: ${target}`)
}

main()
