import { existsSync, readFileSync } from "node:fs"

type Check = {
  file: string
  needles: string[]
}

const checks: Check[] = [
  {
    file: "agents/ctf-web.md",
    needles: ["ctf-web-fingerprint", "ctf-web-blackbox-map mode=light", "ctf-web-runtime-map", "work/ctf-evidence"],
  },
  {
    file: "commands/ctf-web.md",
    needles: [
      "ctf-web-analyze",
      "ctf-web-source-map",
      "ctf-web-attack-queue",
      "ctf-web-primitive-lock",
      "ctf-web-control-plane",
      "ctf-web-exploit-chain",
      "High-Risk Action Plan",
    ],
  },
  {
    file: "commands/help.md",
    needles: ["/ctf", "/help", "/ctf-web", "Historical compatibility aliases"],
  },
  {
    file: "commands/ctf-expert.md",
    needles: ["ctf-evidence-board", "ctf-team-dispatch", "ctf-mcp-control"],
  },
  {
    file: "skills/ctf-web/SKILL.md",
    needles: ["references/REFERENCE_INDEX.md", "ctf-web-recon", "ctf-web-attack-queue", "ctf-web-primitive-lock"],
  },
  {
    file: "skills/ctf-web/references/REFERENCE_INDEX.md",
    needles: ["# Web Reference Index", "## Recon / Mapping", "## Closure / Endgame", "## Maintenance Rule"],
  },
  {
    file: "skills/ctf-web/references/web-closure-matrix.md",
    needles: [
      "Highest-value closure path",
      "First safe probe",
      "Downgrade trigger",
      "source leak",
      "upload / file write",
    ],
  },
  {
    file: "tools/web/ctf-web-blackbox-map.ts",
    needles: ["mode", "api_candidates", "attack_queue_seed"],
  },
  {
    file: "tools/web/ctf-web-recon-pack.ts",
    needles: ["ctf-web-blackbox-map", "next_tool", "decision_contract"],
  },
  {
    file: "tools/core/ctf-evidence-board.ts",
    needles: ["Evidence.md", "set-routes", "case.json"],
  },
  {
    file: "scripts/ctf-benchmark.ts",
    needles: ["web", "check-web-benchmarks.ts"],
  },
  {
    file: "scripts/check-web-benchmarks.ts",
    needles: ["recon before exploit", "attack queue ranked", "file-write routed to ctf-web-file-write"],
  },
  {
    file: "commands/resume.md",
    needles: ["templates/ctf_resume_packet.md", "ctf_fast_handoff.md", "ctf_handoff.md", "ctf_evidence_snapshot.md"],
  },
  {
    file: "skills/ctf-common/SKILL.md",
    needles: ["work/ctf-evidence/<challenge-slug>/", "templates/ctf_plan.md", "templates/ctf_handoff.md"],
  },
]

const retiredPaths = new Set(["commands/ctf-web-benchmark.md", "commands/ctf-close.md", "commands/ctf-final.md"])

const failures: string[] = []
for (const check of checks) {
  if (!existsSync(check.file)) {
    failures.push(`${check.file} missing file`)
    continue
  }
  const text = readFileSync(check.file, "utf8")
  for (const needle of check.needles) {
    if (!text.includes(needle)) failures.push(`${check.file} missing ${needle}`)
  }
}

for (const retired of retiredPaths) {
  if (existsSync(retired)) failures.push(`${retired} should stay retired from the public slash surface`)
}

if (failures.length) {
  console.error("web smoke check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`web_smoke_ok checks=${checks.length}`)
