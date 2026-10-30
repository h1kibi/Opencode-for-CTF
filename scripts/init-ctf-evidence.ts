import { bootstrapEvidenceDir, formatRecordTimestamp } from "./evidence-helper.ts"
import { existsSync } from "node:fs"
import { getEvidenceDir } from "./evidence-helper.ts"

function main() {
  // Record folders are named by creation timestamp (YYMMDDHHmm); an explicit
  // slug argument is still honored for scripted/legacy use.
  let slug = process.argv[2]
  if (!slug) {
    slug = formatRecordTimestamp()
    let suffix = 2
    while (existsSync(getEvidenceDir(process.cwd(), slug))) slug = `${formatRecordTimestamp()}-${suffix++}`
    console.log("(no slug argument given; using creation timestamp as the record folder name)")
  }

  const root = process.cwd()
  const outDir = bootstrapEvidenceDir(root, slug)

  console.log(`# Initialized CTF evidence directory\n`)
  console.log(`- path: ${outDir}`)
  console.log(`- files:`)
  console.log(`  - inventory.md`)
  console.log(`  - route.json`)
  console.log(`  - hypotheses.json`)
  console.log(`  - signal-memory.yaml`)
  console.log(`  - primitive.json`)
  console.log(`  - closure.json`)
  console.log(`  - resume.md`)
  console.log(`  - handoff.md`)
  console.log(`  - fast-handoff.md`)
  console.log(`  - snapshot.md`)
}

main()
