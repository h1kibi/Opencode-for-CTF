import { bootstrapEvidenceDir, readEvidenceState, writeEvidenceState } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  const nextAction = process.argv[3] || "CONTINUE"
  if (!slug) {
    console.log("Usage: node scripts/snapshot-helper.ts <challenge-slug> [next-action]")
    process.exit(1)
  }

  const root = process.cwd()
  bootstrapEvidenceDir(root, slug)
  const route = readEvidenceState(root, "route", slug) as Record<string, unknown> | null
  const hypotheses = readEvidenceState(root, "hypotheses", slug) as Record<string, unknown> | null
  const primitive = readEvidenceState(root, "primitive", slug) as Record<string, unknown> | null

  const routePatch = [
    route?.primary_owner ? `primary_owner=${String(route.primary_owner)}` : "",
    route?.first_safe_tool ? `first_safe_tool=${String(route.first_safe_tool)}` : "",
    `next_probe=${nextAction}`,
  ].filter(Boolean).join(",")

  const primitivePatch = [
    primitive?.primitive ? `primitive=${String(primitive.primitive)}` : "",
    primitive?.closure_owner ? `closure_owner=${String(primitive.closure_owner)}` : "",
  ].filter(Boolean).join(",")

  const hypothesesPatch = [
    hypotheses?.primary_owner ? `primary_owner=${String(hypotheses.primary_owner)}` : "",
    `next_probe=${nextAction}`,
  ].filter(Boolean).join(",")

  const routeTarget = routePatch ? writeEvidenceState(root, "route", slug, routePatch) : null
  const hypothesesTarget = hypothesesPatch ? writeEvidenceState(root, "hypotheses", slug, hypothesesPatch) : null
  const primitiveTarget = primitivePatch ? writeEvidenceState(root, "primitive", slug, primitivePatch) : null

  console.log(JSON.stringify({
    updated_route: routeTarget,
    updated_hypotheses: hypothesesTarget,
    updated_primitive: primitiveTarget,
    recommended_next_control_action: nextAction,
  }, null, 2))
}

main()
