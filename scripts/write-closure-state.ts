import { writeEvidenceState } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  const patchRaw = process.argv[3]
  if (!slug || !patchRaw) {
    console.log("Usage: node scripts/write-closure-state.ts <challenge-slug> '<json-patch>'")
    process.exit(1)
  }

  const root = process.cwd()
  const target = writeEvidenceState(root, "closure", slug, patchRaw)
  console.log(`Updated closure state: ${target}`)
}

main()
