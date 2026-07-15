import { writeEvidenceState, type EvidenceKind, TARGETS } from "./evidence-helper.ts"

function main() {
  const kind = process.argv[2] as EvidenceKind
  const slug = process.argv[3]
  const patchRaw = process.argv[4]

  if (!kind || !(kind in TARGETS) || !slug || !patchRaw) {
    console.log("Usage: node scripts/write-evidence-state.ts <route|primitive|closure> <challenge-slug> '<json-patch|key=value,...>'")
    process.exit(1)
  }

  const root = process.cwd()
  const target = writeEvidenceState(root, kind, slug, patchRaw)
  console.log(`Updated ${kind} state: ${target}`)
}

main()
