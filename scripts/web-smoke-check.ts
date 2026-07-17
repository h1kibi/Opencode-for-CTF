import { readFileSync } from "node:fs"

const checks: Array<{ file: string; needles: string[] }> = [
  {
    file: "agents/ctf-web.md",
    needles: [
      "ctf-web-fingerprint",
      "ctf-web-blackbox-map mode=light",
      "ctf-web-runtime-map",
      "ctf-web-authz-matrix",
      "ctf-web-template-check",
      "web-closure-matrix.md",
      "work/ctf-evidence",
    ],
  },
  {
    file: "skills/ctf-web/SKILL.md",
    needles: [
      "Keep this skill thin.",
      "references/REFERENCE_INDEX.md",
      "ctf-web-recon",
      "ctf-web-attack-queue",
      "ctf-web-primitive-lock",
      "ctf-web-control-plane",
      "ctf-web-exploit-chain",
      "references/web-closure-matrix.md",
      "references/flag-recovery.md",
    ],
  },
  {
    file: "skills/ctf-web/references/REFERENCE_INDEX.md",
    needles: [
      "# Web Reference Index",
      "## Recon / Mapping",
      "## Differential / Parser / State",
      "## Closure / Endgame",
      "## Maintenance Rule",
    ],
  },
  {
    file: "skills/ctf-web/references/web-closure-matrix.md",
    needles: [
      "Highest-value closure path",
      "First safe probe",
      "Downgrade trigger",
      "source leak",
      "DB read / SQLi",
      "upload / file write",
    ],
  },
  {
    file: "commands/ctf-web.md",
    needles: [
      "recon → attack-queue → focused-probe → primitive-lock → control-plane → final-chain → retro",
      "ctf-web-recon",
      "ctf-web-attack-queue",
      "ctf-web-primitive-lock",
      "ctf-web-control-plane",
      "ctf-web-exploit-chain",
      "ctf-web-stability-guard",
      "Primitive Ledger",
      "High-Risk Action Plan",
    ],
  },
  {
    file: "commands/ctf-web-benchmark.md",
    needles: [
      "Run Web CTF regression benchmarks",
      "Recon Map",
      "Attack Queue",
      "ctf-web-file-write",
      "node scripts/ctf-benchmark.ts web <target>",
      "node scripts/ctf-benchmark.ts pwn <target>",
    ],
  },
  {
    file: "commands/ctf-close.md",
    needles: ["work/ctf-evidence", "closure.json", "final-verification.txt"],
  },
  {
    file: "commands/ctf-final.md",
    needles: ["work/ctf-evidence", "solve-output.txt", "final-verification.txt"],
  },
  {
    file: "commands/ctf-resume.md",
    needles: ["templates/ctf_handoff.md", "templates/ctf_evidence_snapshot.md"],
  },
  {
    file: "skills/ctf-common/SKILL.md",
    needles: ["work/ctf-evidence/<challenge-slug>/", "templates/ctf_plan.md", "templates/ctf_handoff.md"],
  },
  {
    file: "docs/CTF_COMMAND_LAYERS.md",
    needles: [
      "## Entry Commands",
      "## State / Control Commands",
      "## Closure / Final Commands",
      "## Soft Deprecation Policy",
    ],
  },
]

const failures: string[] = []
for (const check of checks) {
  const text = readFileSync(check.file, "utf8")
  for (const needle of check.needles) {
    if (!text.includes(needle)) failures.push(`${check.file} missing ${needle}`)
  }
}

if (failures.length) {
  console.error("web smoke check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`web_smoke_ok checks=${checks.length}`)
