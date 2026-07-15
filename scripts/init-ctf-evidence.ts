import { bootstrapEvidenceDir } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.log("Usage: node scripts/init-ctf-evidence.ts <challenge-slug>")
    process.exit(1)
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
