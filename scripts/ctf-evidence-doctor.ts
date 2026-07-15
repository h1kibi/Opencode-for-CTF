import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  PREFERRED_RESTART_FILES,
  STRUCTURED_STATE_FILES,
  TARGETS,
  bootstrapEvidenceDir,
  getEvidenceDir,
  getTargetPath,
  listExistingEvidenceFiles,
  readPreferredRestartPath,
} from "./evidence-helper.ts"

type Kind = keyof typeof TARGETS

type CheckRow = {
  label: string
  status: "PASS" | "FAIL" | "WARN"
  detail: string
}

function push(rows: CheckRow[], label: string, status: CheckRow["status"], detail: string) {
  rows.push({ label, status, detail })
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
  } catch {
    return null
  }
}

function firstMissingRequiredKeys(data: Record<string, unknown> | null, keys: string[]) {
  if (!data) return keys
  return keys.filter((key) => {
    const value = data[key]
    if (typeof value === "boolean") return false
    return value === undefined || value === null || value === ""
  })
}

function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.log("Usage: node scripts/ctf-evidence-doctor.ts <challenge-slug>")
    process.exit(1)
  }

  const root = process.cwd()
  bootstrapEvidenceDir(root, slug)

  const rows: CheckRow[] = []
  const evidenceDir = getEvidenceDir(root, slug)
  const preferredRestart = readPreferredRestartPath(root, slug)

  push(rows, "evidence_dir", existsSync(evidenceDir) ? "PASS" : "FAIL", evidenceDir)

  for (const [kind, filename] of Object.entries(TARGETS) as Array<[Kind, string]>) {
    const path = getTargetPath(root, slug, filename)
    push(rows, `core:${kind}`, existsSync(path) ? "PASS" : "FAIL", filename)
  }

  for (const filename of ["resume.md", "handoff.md", "fast-handoff.md", "snapshot.md"]) {
    const path = getTargetPath(root, slug, filename)
    push(rows, `restart:${filename}`, existsSync(path) ? "PASS" : "WARN", filename)
  }

  const route = readJsonIfExists(getTargetPath(root, slug, "route.json"))
  const primitive = readJsonIfExists(getTargetPath(root, slug, "primitive.json"))
  const closure = readJsonIfExists(getTargetPath(root, slug, "closure.json"))
  const hypotheses = readJsonIfExists(getTargetPath(root, slug, "hypotheses.json"))

  const routeMissing = firstMissingRequiredKeys(route, ["primary_owner", "first_safe_tool"])
  push(
    rows,
    "route_contract",
    routeMissing.length === 0 ? "PASS" : "WARN",
    routeMissing.length === 0 ? "primary_owner + first_safe_tool present" : `missing ${routeMissing.join(", ")}`,
  )

  const primitiveMissing = firstMissingRequiredKeys(primitive, ["primitive", "closure_owner"])
  push(
    rows,
    "primitive_contract",
    primitiveMissing.length === 0 ? "PASS" : "WARN",
    primitiveMissing.length === 0 ? "primitive + closure_owner present" : `missing ${primitiveMissing.join(", ")}`,
  )

  const closureMissing = firstMissingRequiredKeys(closure, ["closure_owner", "top_closure_probe"])
  push(
    rows,
    "closure_contract",
    closureMissing.length === 0 ? "PASS" : "WARN",
    closureMissing.length === 0 ? "closure_owner + top_closure_probe present" : `missing ${closureMissing.join(", ")}`,
  )

  const hypothesesSignal = hypotheses && (Array.isArray(hypotheses.hypotheses) || Array.isArray(hypotheses.queue))
  push(
    rows,
    "hypotheses_signal",
    hypothesesSignal ? "PASS" : "WARN",
    hypothesesSignal ? "hypothesis list present" : "no `hypotheses` or `queue` array found",
  )

  push(
    rows,
    "preferred_restart",
    preferredRestart ? "PASS" : "FAIL",
    preferredRestart ?? "no preferred restart artifact found",
  )

  const restartOrder = PREFERRED_RESTART_FILES.map((filename) => {
    const path = join(evidenceDir, filename)
    return `${existsSync(path) ? "[x]" : "[ ]"} ${filename}`
  })
  const structuredOrder = STRUCTURED_STATE_FILES.map((filename) => {
    const path = join(evidenceDir, filename)
    return `${existsSync(path) ? "[x]" : "[ ]"} ${filename}`
  })
  const existingFiles = listExistingEvidenceFiles(root, slug)

  push(
    rows,
    "evidence_files_present",
    existingFiles.length > 0 ? "PASS" : "FAIL",
    existingFiles.length > 0 ? `${existingFiles.length} tracked evidence files present` : "no tracked evidence files present",
  )

  console.log("# CTF Evidence Doctor\n")
  console.log(`- slug: ${slug}`)
  console.log(`- dir: ${evidenceDir}`)
  console.log(`- preferred_restart: ${preferredRestart ?? "none"}`)
  console.log("\n| Check | Status | Detail |")
  console.log("|---|---|---|")
  for (const row of rows) {
    console.log(`| ${row.label} | ${row.status} | ${row.detail.replace(/\|/g, "/")} |`)
  }

  console.log("\n## Restart Priority\n")
  for (const line of restartOrder) console.log(`- ${line}`)

  console.log("\n## Structured State Priority\n")
  for (const line of structuredOrder) console.log(`- ${line}`)

  const failCount = rows.filter((row) => row.status === "FAIL").length
  process.exit(failCount > 0 ? 1 : 0)
}

main()
