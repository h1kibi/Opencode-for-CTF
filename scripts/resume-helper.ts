import { bootstrapEvidenceDir, readPreferredRestartPath, readEvidenceState } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.log("Usage: node scripts/resume-helper.ts <challenge-slug>")
    process.exit(1)
  }

  const root = process.cwd()
  bootstrapEvidenceDir(root, slug)
  const preferred = readPreferredRestartPath(root, slug)
  const route = readEvidenceState(root, "route", slug)
  const hypotheses = readEvidenceState(root, "hypotheses", slug)
  const signalMemory = readEvidenceState(root, "signal-memory", slug)
  const primitive = readEvidenceState(root, "primitive", slug)
  const closure = readEvidenceState(root, "closure", slug)

  console.log(JSON.stringify({
    preferred_restart_artifact: preferred,
    route,
    hypotheses,
    signal_memory: signalMemory,
    primitive,
    closure,
  }, null, 2))
}

main()
