import { readEvidenceState, readPreferredRestartPath } from "./evidence-helper.ts"

type Kind = "route" | "primitive" | "closure" | "hypotheses" | "signal-memory" | "inventory" | "preferred-restart"

function main() {
  const kind = process.argv[2] as Kind
  const slug = process.argv[3]

  if (!kind || !slug) {
    console.log(
      "Usage: node scripts/read-evidence-state.ts <route|primitive|closure|hypotheses|signal-memory|inventory|preferred-restart> <challenge-slug>",
    )
    process.exit(1)
  }

  const root = process.cwd()

  if (kind === "route") {
    const data = readEvidenceState(root, "route", slug)
    if (!data) process.exit(1)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (kind === "primitive") {
    const data = readEvidenceState(root, "primitive", slug)
    if (!data) process.exit(1)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (kind === "closure") {
    const data = readEvidenceState(root, "closure", slug)
    if (!data) process.exit(1)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (kind === "hypotheses") {
    const data = readEvidenceState(root, "hypotheses", slug)
    if (!data) process.exit(1)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (kind === "signal-memory") {
    const data = readEvidenceState(root, "signal-memory", slug)
    if (!data) process.exit(1)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (kind === "inventory") {
    const data = readEvidenceState(root, "inventory", slug)
    if (!data) process.exit(1)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  const found = readPreferredRestartPath(root, slug)
  if (!found) process.exit(1)
  console.log(found)
}

main()
