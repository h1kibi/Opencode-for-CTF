import { existsSync, mkdirSync, writeFileSync } from "fs"
import { resolve, join } from "path"
import { spawnSync } from "child_process"

type CheckResult = {
  name: string
  status: "PASS" | "FAIL" | "SKIP"
  detail: string
}

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  })
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function tsxArgs(script: string, extra: string[] = []) {
  const tsxCli = resolve("node_modules", "tsx", "dist", "cli.mjs")
  if (!existsSync(tsxCli)) return null
  return [tsxCli, script, ...extra]
}

function main() {
  const cwd = process.cwd()
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const slug = process.argv[2] || "manual"
  const args = process.argv.slice(3)
  let webTarget: string | undefined
  let pwnTarget: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--web-target") webTarget = args[i + 1]
    if (args[i] === "--pwn-target") pwnTarget = args[i + 1]
  }
  const outDir = resolve("work", "config-qa", `${stamp}-${slug}`)
  ensureDir(outDir)

  const results: CheckResult[] = []

  const toolingArgs = tsxArgs(join("scripts", "verify-ctf-tooling.ts"))
  if (toolingArgs) {
    const res = run("node", toolingArgs, cwd)
    writeFileSync(join(outDir, "verify-ctf-tooling.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "verify-ctf-tooling",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: res.status === 0 ? "tooling smoke completed" : "tooling smoke failed",
    })
  } else {
    results.push({
      name: "verify-ctf-tooling",
      status: "SKIP",
      detail: "tsx runtime missing under node_modules/tsx/dist/cli.mjs",
    })
  }

  const configHygieneScript = resolve("scripts", "check-config-hygiene.ts")
  if (existsSync(configHygieneScript)) {
    const res = run("node", [configHygieneScript], cwd)
    writeFileSync(join(outDir, "check-config-hygiene.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "check-config-hygiene",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: res.status === 0 ? "config hygiene audit completed" : "config hygiene audit failed",
    })
  } else {
    results.push({
      name: "check-config-hygiene",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const webArgs = tsxArgs(join("scripts", "check-web-benchmarks.ts"), webTarget ? [webTarget] : [])
  if (webArgs && webTarget) {
    const res = run("node", webArgs, cwd)
    writeFileSync(join(outDir, "check-web-benchmarks.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "check-web-benchmarks",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: `web benchmark check ran against ${webTarget}`,
    })
  } else {
    results.push({
      name: "check-web-benchmarks",
      status: "SKIP",
      detail: webTarget ? "tsx runtime missing" : "no web benchmark target path supplied",
    })
  }

  const pwnScript = resolve("scripts", "check-pwn-benchmarks.ts")
  if (existsSync(pwnScript) && pwnTarget) {
    const res = run("node", [pwnScript, pwnTarget], cwd)
    writeFileSync(join(outDir, "check-pwn-benchmarks.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "check-pwn-benchmarks",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: `pwn benchmark check ran against ${pwnTarget}`,
    })
  } else {
    results.push({
      name: "check-pwn-benchmarks",
      status: "SKIP",
      detail: pwnTarget ? "script missing" : "no pwn benchmark target path supplied",
    })
  }

  const hardRegressionScript = resolve("scripts", "check-hard-regression.ts")
  if (existsSync(hardRegressionScript)) {
    const res = run("node", [hardRegressionScript, join("benchmarks", "hard-regression")], cwd)
    writeFileSync(join(outDir, "check-hard-regression.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "check-hard-regression",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "controller regression case audit completed",
    })
  } else {
    results.push({
      name: "check-hard-regression",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const commandContractScript = resolve("scripts", "check-command-helper-contracts.ts")
  if (existsSync(commandContractScript)) {
    const res = run("node", [commandContractScript], cwd)
    writeFileSync(join(outDir, "check-command-helper-contracts.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "check-command-helper-contracts",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "command helper contract audit completed",
    })
  } else {
    results.push({
      name: "check-command-helper-contracts",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const lessonIndexScript = resolve("scripts", "check-lesson-index-readiness.ts")
  if (existsSync(lessonIndexScript)) {
    const res = run("node", [lessonIndexScript], cwd)
    writeFileSync(join(outDir, "check-lesson-index-readiness.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "check-lesson-index-readiness",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "lesson index readiness audit completed",
    })
  } else {
    results.push({
      name: "check-lesson-index-readiness",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const initEvidenceScript = resolve("scripts", "init-ctf-evidence.ts")
  if (existsSync(initEvidenceScript)) {
    const res = run("node", [initEvidenceScript, "qa-evidence-init"], cwd)
    writeFileSync(join(outDir, "init-ctf-evidence.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "init-ctf-evidence",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "canonical evidence directory bootstrap executed",
    })
  } else {
    results.push({
      name: "init-ctf-evidence",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const evidenceDoctorScript = resolve("scripts", "ctf-evidence-doctor.ts")
  if (existsSync(evidenceDoctorScript)) {
    const res = run("node", [evidenceDoctorScript, "qa-evidence-init"], cwd)
    writeFileSync(join(outDir, "ctf-evidence-doctor.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "ctf-evidence-doctor",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "evidence doctor executed on qa-evidence-init",
    })
  } else {
    results.push({
      name: "ctf-evidence-doctor",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const revTeamInitScript = resolve("scripts", "init-rev-team-memory.ts")
  if (existsSync(revTeamInitScript)) {
    const res = run("node", [revTeamInitScript, "qa-rev-team", "qa-target"], cwd)
    writeFileSync(join(outDir, "init-rev-team-memory.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "init-rev-team-memory",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "rev team public memory bootstrap executed",
    })
  } else {
    results.push({
      name: "init-rev-team-memory",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const revTeamUpdateScript = resolve("scripts", "update-rev-team-memory.ts")
  if (existsSync(revTeamUpdateScript)) {
    const patchFile = join(outDir, "rev-patch.json")
    const patch = JSON.stringify({
      confirmed_facts: [
        { fact: "qa rev team memory writable", evidence: "config qa", confidence: "high", owner: "lead" },
      ],
      high_value_signals: [
        { signal: "qa-signal", why_it_matters: "validates append merge", status: "closed" },
      ],
      next_action: { owner: "lead", action: "QA_COMPLETE", tool: "update-rev-team-memory", why: "script smoke passed" },
    })
    writeFileSync(patchFile, patch)
    const res = run("node", [revTeamUpdateScript, "qa-rev-team", patchFile], cwd)
    writeFileSync(join(outDir, "update-rev-team-memory.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "update-rev-team-memory",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "rev team public memory merge executed",
    })
  } else {
    results.push({
      name: "update-rev-team-memory",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const revTeamReadScript = resolve("scripts", "read-rev-team-memory.ts")
  if (existsSync(revTeamReadScript)) {
    const res = run("node", [revTeamReadScript, "qa-rev-team", "confirmed_facts"], cwd)
    writeFileSync(join(outDir, "read-rev-team-memory.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "read-rev-team-memory",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "rev team public memory reader executed",
    })
  } else {
    results.push({
      name: "read-rev-team-memory",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const routeWriter = resolve("scripts", "write-route-state.ts")
  if (existsSync(routeWriter)) {
    const res = run("node", [routeWriter, "qa-evidence-init", "primary_owner=misc,first_safe_tool=ctf-one-shot-triage"], cwd)
    writeFileSync(join(outDir, "write-route-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-route-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "route state writer executed",
    })
  } else {
    results.push({
      name: "write-route-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const primitiveWriter = resolve("scripts", "write-primitive-state.ts")
  if (existsSync(primitiveWriter)) {
    const res = run("node", [primitiveWriter, "qa-evidence-init", "primitive=source_leak,closure_owner=web"], cwd)
    writeFileSync(join(outDir, "write-primitive-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-primitive-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "primitive state writer executed",
    })
  } else {
    results.push({
      name: "write-primitive-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const closureWriter = resolve("scripts", "write-closure-state.ts")
  if (existsSync(closureWriter)) {
    const res = run("node", [closureWriter, "qa-evidence-init", "current_primitive=source_leak,closure_owner=web,top_closure_probe=read config path"], cwd)
    writeFileSync(join(outDir, "write-closure-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-closure-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "closure state writer executed",
    })
  } else {
    results.push({
      name: "write-closure-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const unifiedWriter = resolve("scripts", "write-evidence-state.ts")
  if (existsSync(unifiedWriter)) {
    const res = run("node", [unifiedWriter, "route", "qa-evidence-init", "primary_owner=misc,first_safe_tool=ctf-one-shot-triage"], cwd)
    writeFileSync(join(outDir, "write-evidence-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-evidence-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "unified evidence state writer executed",
    })
  } else {
    results.push({
      name: "write-evidence-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const unifiedReader = resolve("scripts", "read-evidence-state.ts")
  if (existsSync(unifiedReader)) {
    const res = run("node", [unifiedReader, "preferred-restart", "qa-evidence-init"], cwd)
    writeFileSync(join(outDir, "read-evidence-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "read-evidence-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "unified evidence state reader executed",
    })
  } else {
    results.push({
      name: "read-evidence-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const hypothesesReader = resolve("scripts", "read-evidence-state.ts")
  if (existsSync(hypothesesReader)) {
    const res = run("node", [hypothesesReader, "hypotheses", "qa-evidence-init"], cwd)
    writeFileSync(join(outDir, "read-hypotheses-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "read-hypotheses-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "structured hypotheses state reader executed",
    })
  } else {
    results.push({
      name: "read-hypotheses-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const signalReader = resolve("scripts", "read-evidence-state.ts")
  if (existsSync(signalReader)) {
    const res = run("node", [signalReader, "signal-memory", "qa-evidence-init"], cwd)
    writeFileSync(join(outDir, "read-signal-memory-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "read-signal-memory-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "structured signal memory reader executed",
    })
  } else {
    results.push({
      name: "read-signal-memory-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const inventoryWriter = resolve("scripts", "write-evidence-state.ts")
  if (existsSync(inventoryWriter)) {
    const res = run("node", [inventoryWriter, "inventory", "qa-evidence-init", "Target=qa,FirstSafeTool=ctf-one-shot-triage"], cwd)
    writeFileSync(join(outDir, "write-inventory-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-inventory-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "inventory evidence writer executed",
    })
  } else {
    results.push({
      name: "write-inventory-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const hypothesesWriter = resolve("scripts", "write-evidence-state.ts")
  if (existsSync(hypothesesWriter)) {
    const res = run("node", [hypothesesWriter, "hypotheses", "qa-evidence-init", "primary_owner=misc,next_probe=ctf-one-shot-triage,kill_rule=flat-queue-requires-pivot"], cwd)
    writeFileSync(join(outDir, "write-hypotheses-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-hypotheses-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "hypotheses evidence writer executed",
    })
  } else {
    results.push({
      name: "write-hypotheses-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const signalWriter = resolve("scripts", "write-evidence-state.ts")
  if (existsSync(signalWriter)) {
    const res = run("node", [signalWriter, "signal-memory", "qa-evidence-init", "confirmed_assets=source leak,next_one_variable_probe=read config path"], cwd)
    writeFileSync(join(outDir, "write-signal-memory-state.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "write-signal-memory-state",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "signal memory writer executed",
    })
  } else {
    results.push({
      name: "write-signal-memory-state",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const resumeHelper = resolve("scripts", "resume-helper.ts")
  if (existsSync(resumeHelper)) {
    const res = run("node", [resumeHelper, "qa-evidence-init"], cwd)
    writeFileSync(join(outDir, "resume-helper.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "resume-helper",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "resume-side helper executed",
    })
  } else {
    results.push({
      name: "resume-helper",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const snapshotHelper = resolve("scripts", "snapshot-helper.ts")
  if (existsSync(snapshotHelper)) {
    const res = run("node", [snapshotHelper, "qa-evidence-init", "CONTINUE"], cwd)
    writeFileSync(join(outDir, "snapshot-helper.txt"), `${res.stdout || ""}${res.stderr || ""}`)
    results.push({
      name: "snapshot-helper",
      status: res.status === 0 ? "PASS" : "FAIL",
      detail: "snapshot-side helper executed",
    })
  } else {
    results.push({
      name: "snapshot-helper",
      status: "SKIP",
      detail: "script missing",
    })
  }

  const lines = [
    "# CTF Config QA",
    "",
    `- cwd: ${cwd}`,
    `- output: ${outDir}`,
    `- web_target: ${webTarget ?? "none"}`,
    `- pwn_target: ${pwnTarget ?? "none"}`,
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${r.status} | ${r.detail} |`),
    "",
    "Notes:",
    "- PASS means the wrapper executed and the child returned 0.",
    "- SKIP means a required runtime or benchmark target path was not available.",
    "- FAIL means the child process ran and returned a non-zero status.",
    "- Use --web-target and --pwn-target independently so one family can run even when the other has no fixture.",
  ]

  writeFileSync(join(outDir, "summary.md"), lines.join("\n"))

  if (slug === "readiness") {
    const manifestPath = resolve("ctf-agent.manifest.json")
    const readinessLines = [
      "# CTF Practical Readiness",
      "",
      `- manifest_present: ${existsSync(manifestPath) ? "yes" : "no"}`,
      `- lesson_index_present: ${existsSync(resolve("knowledge", "lessons", "lessons.index.json")) ? "yes" : "no"}`,
      `- lesson_index_readiness_pass: ${results.find((r) => r.name === "check-lesson-index-readiness")?.status === "PASS" ? "yes" : "no"}`,
      `- command_contracts_pass: ${results.find((r) => r.name === "check-command-helper-contracts")?.status === "PASS" ? "yes" : "no"}`,
      `- evidence_bootstrap_pass: ${results.find((r) => r.name === "init-ctf-evidence")?.status === "PASS" ? "yes" : "no"}`,
      `- benchmark_smoke_pass: ${results.find((r) => r.name === "check-hard-regression")?.status === "PASS" ? "yes" : "no"}`,
      "",
      "verdict_logic:",
      "- READY requires manifest, lesson index, command contracts, evidence bootstrap, and benchmark smoke to all pass.",
      "- PARTIAL means the core config works but one or more readiness gates are weak or skipped.",
      "- BLOCKED means a core readiness gate failed.",
    ]
    writeFileSync(join(outDir, "readiness.md"), readinessLines.join("\n"))
  }

  console.log(lines.join("\n"))
}

main()
