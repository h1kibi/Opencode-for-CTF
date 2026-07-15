import { writeEvidenceState } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  const patchRaw = process.argv[3]
  if (!slug || !patchRaw) {
    console.log("Usage: node scripts/write-primitive-state.ts <challenge-slug> '<json-patch>'")
    process.exit(1)
  }

  const root = process.cwd()
  const target = writeEvidenceState(root, "primitive", slug, patchRaw)
  console.log(`Updated primitive state: ${target}`)
}

main()
