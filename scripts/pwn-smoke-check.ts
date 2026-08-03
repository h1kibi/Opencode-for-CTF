import { existsSync, readFileSync } from "node:fs"

type Check = {
  file: string
  needles: string[]
}

const checks: Check[] = [
  {
    file: "commands/ctf-pwn.md",
    needles: [
      "ctf-pwn",
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
      "Prefer pwntools scripts",
    ],
  },
  {
    file: "commands/ctf-fast.md",
    needles: ["agent: ctf-fast", "15 minutes", "ctf-evidence-board command=init", "fast tool allowlist"],
  },
  {
    file: "commands/ctf-expert.md",
    needles: ["ctf-evidence-board", "ctf-team-dispatch", "ctf-mcp-control", "ctf-pattern-card-search"],
  },
  {
    file: "commands/help.md",
    needles: ["/ctf", "/help", "/ctf-pwn", "Historical compatibility aliases"],
  },
  {
    file: "tools/pwn/ctf-pwn-probe.ts",
    needles: ['schema_version: "pwn_probe.v1"', "best_fast_path", "one_variable_probe", "recommended_next_action"],
  },
  {
    file: "tools/pwn/ctf-pwn-runner.ts",
    needles: ['schema_version: "pwn_runner_summary.v2"', "remote_success", "recommended_runner"],
  },
  {
    file: "tools/pwn/ctf-pwn-docker-runner.ts",
    needles: ['schema_version: "pwn_docker_runner.v4"', "output_path", "success_by_regex"],
  },
  {
    file: "tools/pwn/ctf-pwn-libc-runtime-doctor.ts",
    needles: ["pwn_libc_runtime_doctor:", "recommended_image:", "explicit_loader_command:"],
  },
  {
    file: "tools/pwn/ctf-pwn-menu-contract-probe.ts",
    needles: ["pwn_menu_contract_probe:", "read_exact:", "helper_contract:"],
  },
  {
    file: "tools/pwn/ctf-pwn-io-diff-check.ts",
    needles: ['schema_version: "pwn_io_diff_check.v1"', "menu_desync_risk", "stop_rule:"],
  },
  {
    file: "tools/pwn/ctf-pwn-playbook-router.ts",
    needles: ['schema_version: "pwn_playbook_router.v1"', "closure_priority:", "top_routes"],
  },
  {
    file: "tools/core/ctf-binary-probe.ts",
    needles: ["probe_backend:", "preferred_backend_for_future_steps:", "safeExecDocker"],
  },
  {
    file: "skills/ctf-pwn/SKILL.md",
    needles: ["references/REFERENCE_INDEX.md", "pwn-route-matrix.md", "pwn-runtime-trigger-matrix.md"],
  },
  {
    file: "skills/ctf-pwn/references/REFERENCE_INDEX.md",
    needles: ["# PWN Reference Index", "## Route Families", "## Trigger Rules", "## Maintenance Rule"],
  },
  {
    file: "skills/ctf-pwn/references/pwn-mode-boundary.md",
    needles: ["# PWN Mode Boundary", "ctf-fast", "ctf-expert", "ctf-pwn"],
  },
  {
    file: "skills/ctf-pwn/references/pwn-runtime-trigger-matrix.md",
    needles: ["# PWN Runtime Trigger Matrix", "ctf-pwn-libc-runtime-doctor", "ctf-pwn-menu-contract-probe"],
  },
  {
    file: "rag/knowledge/pwn/README.md",
    needles: ["PWN Knowledge Index", "bundled-libc-first.md", "glibc-version-route-map.md", "exact-read-contracts.md"],
  },
  {
    file: "rag/knowledge/pattern-cards/pwn-curated.cards.v1.json",
    needles: ["pwn-runtime-bundled-libc-first", '"curated": true'],
  },
  {
    file: "templates/solve_pwn.py",
    needles: ["leak_to_u64", "ret2libc_chain", "--remote", "--payload-file"],
  },
  {
    file: "templates/pwn_notes.md",
    needles: ["# PWN Solve Notes", "Protection Summary", "Primitive Ladder", "Final Verification"],
  },
  {
    file: "scripts/ctf-benchmark.ts",
    needles: ["pwn", "check-pwn-benchmarks.ts"],
  },
  {
    file: "packages/ctf-benchmark-core/src/index.ts",
    needles: ["ret2win-basic", "control-confirmed-calibration", "remote-drift"],
  },
]

const retiredPaths = new Set([
  "commands/image-info.md",
  "commands/ctf-pwn-vm-open.md",
  "commands/ctf-pwn-runtime-doctor.md",
  "commands/ctf-pwn-menu-contract.md",
  "commands/ctf-pwn-overlap-map.md",
  "commands/ctf-pwn-wp-diff.md",
  "commands/ctf-pwn-replay.md",
  "commands/ctf-final.md",
  "commands/ctf-close.md",
  "commands/ctf-choose.md",
  "commands/ctf-route.md",
  "commands/ctf-branch.md",
  "commands/ctf-recover.md",
  "commands/ctf-endgame.md",
  "commands/ctf-escalate.md",
  "commands/ctf-state-update.md",
  "commands/ctf-budget.md",
  "commands/ctf-owner.md",
  "commands/ctf-pwn-env.md",
  "commands/ctf-pwn-retro.md",
])

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

const routerJsonFixture = JSON.stringify({
  pwn_playbook_router: {
    schema_version: "pwn_playbook_router.v1",
    mode: "medium",
    routes_considered: 1,
    routes_returned: 1,
    signal_summary: ["nx=yes", "ip_control=yes"],
    signals: { nx: true, ip_controlled: true, flag_detected: false },
    closure_priority: "control_to_leak_or_call_chain",
    top_routes: [{ rank: 1, id: "ret2libc-or-rop", score: 100, evidence: ["fixture"] }],
  },
})
const parsedFixture = JSON.parse(routerJsonFixture) as {
  pwn_playbook_router?: { schema_version?: string; signals?: Record<string, unknown>; top_routes?: unknown[] }
}
if (parsedFixture.pwn_playbook_router?.schema_version !== "pwn_playbook_router.v1")
  failures.push("router JSON fixture schema_version mismatch")
if (parsedFixture.pwn_playbook_router?.signals?.ip_controlled !== true)
  failures.push("router JSON fixture signals missing ip_controlled")
if (!Array.isArray(parsedFixture.pwn_playbook_router?.top_routes))
  failures.push("router JSON fixture top_routes not array")

if (failures.length) {
  console.error("pwn smoke check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`pwn_smoke_ok checks=${checks.length}`)
