/**
 * CTF Expert readiness contract.
 *
 * Expert Mode requires a process-level tool registry fixed at OpenCode startup.
 * This module evaluates whether the live session can actually run Team Mode +
 * Evidence.md workflows, and formats fail-fast diagnostics when it cannot.
 */

export const EXPERT_TEAM_RUNTIME_TOOLS = [
  "ctf-team-dispatch",
  "ctf-team-status",
  "ctf-team-collect",
  "ctf-team-cancel",
  "ctf-team-cancel-route",
  "ctf-team-close",
  "ctf-team-recover",
] as const

export const EXPERT_CORE_WORKFLOW_TOOLS = [
  "ctf-evidence-board",
  "ctf-mcp-control",
  "ctf-decompose-task",
] as const

export const EXPERT_SUPPORT_TOOLS = ["ctf-team-mode", "ctf-handoff", "ctf-tool-packs"] as const

/** Route-specific external binaries are intentionally soft dependencies. */
export const EXPERT_SOFT_DEPENDENCIES = ["ida", "jadx", "ghidra", "apktool", "frida"] as const

/** Hard-required tools for /ctf-expert (team runtime + core workflow). */
export const EXPERT_REQUIRED_TOOLS = [
  ...EXPERT_TEAM_RUNTIME_TOOLS,
  ...EXPERT_CORE_WORKFLOW_TOOLS,
] as const

/** Full expert surface including helpful support tools. */
export const EXPERT_ALL_CONTRACT_TOOLS = [
  ...EXPERT_REQUIRED_TOOLS,
  ...EXPERT_SUPPORT_TOOLS,
] as const

export type ExpertReadinessCheck = {
  id: string
  ok: boolean
  required: boolean
  detail: string
  remediation?: string
}

export type ExpertReadinessInput = {
  registeredTools: Iterable<string>
  teamModeEnabled: boolean
  maxWorkers: number
  toolPacks?: string[]
  expertToolPacks?: string[]
  configPath?: string | null
}

export type ExpertReadinessReport = {
  ready: boolean
  checks: ExpertReadinessCheck[]
  missingTools: string[]
  missingSupportTools: string[]
  configPath?: string
  teamModeEnabled: boolean
  maxWorkers: number
  toolPacks: string[]
  expertToolPacks: string[]
}

export type ExpertRecoveryOptions = {
  challengeText?: string
  handoffPath?: string
  evidencePath?: string
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort()
}

/**
 * Evaluate whether the current process registry can run Expert Mode.
 * Pure: no filesystem / process I/O.
 */
export function evaluateExpertReadiness(input: ExpertReadinessInput): ExpertReadinessReport {
  const registered = new Set(
    [...input.registeredTools].map((name) => name.replace(/\.(ts|js)$/, "")).filter(Boolean),
  )
  const toolPacks = input.toolPacks ?? []
  const expertToolPacks = input.expertToolPacks ?? []
  const configPath = input.configPath ?? undefined
  const checks: ExpertReadinessCheck[] = []

  const teamModeOk = input.teamModeEnabled === true
  checks.push({
    id: "team_mode.enabled",
    ok: teamModeOk,
    required: true,
    detail: `team_mode.enabled=${input.teamModeEnabled}`,
    remediation: teamModeOk
      ? undefined
      : 'Set "team_mode": { "enabled": true } in opencode-for-ctf.jsonc and restart OpenCode.',
  })

  const missingTools: string[] = []
  for (const name of EXPERT_REQUIRED_TOOLS) {
    const ok = registered.has(name)
    if (!ok) missingTools.push(name)
    checks.push({
      id: `tool:${name}`,
      ok,
      required: true,
      detail: ok ? `${name} registered` : `${name} missing from process tool registry`,
      remediation: ok
        ? undefined
        : name.startsWith("ctf-team-")
          ? "Enable team_mode.enabled=true and restart OpenCode so Team Mode tools are registered."
          : 'Ensure core tools load (tool_packs includes "core" or "all"), then restart OpenCode.',
    })
  }

  const missingSupportTools: string[] = []
  for (const name of EXPERT_SUPPORT_TOOLS) {
    const ok = registered.has(name)
    if (!ok) missingSupportTools.push(name)
    checks.push({
      id: `support:${name}`,
      ok,
      required: false,
      detail: ok ? `${name} registered` : `${name} missing (support tool)`,
      remediation: ok
        ? undefined
        : 'Support tool missing — usually fixed by loading default/core packs and restarting OpenCode.',
    })
  }

  const ready = teamModeOk && missingTools.length === 0
  return {
    ready,
    checks,
    missingTools,
    missingSupportTools,
    configPath: configPath ?? undefined,
    teamModeEnabled: input.teamModeEnabled,
    maxWorkers: input.maxWorkers,
    toolPacks,
    expertToolPacks,
  }
}

/** Build restart + resume instructions for after a readiness failure. */
export function formatExpertRecoverySteps(opts: ExpertRecoveryOptions = {}): string {
  const trimmedChallenge = (opts.challengeText ?? "").trim()
  const challenge = trimmedChallenge !== "" ? trimmedChallenge : "<challenge description, target, attachments>"
  const resumeHints: string[] = []
  if (opts.handoffPath) resumeHints.push(`Resume from ${opts.handoffPath}; do not restart from zero.`)
  if (opts.evidencePath) resumeHints.push(`Reuse Evidence.md / board under ${opts.evidencePath}.`)
  if (!resumeHints.length) {
    resumeHints.push(
      "If Evidence.md or an expert-handoff already exists under work/ctf-evidence/, resume from it; do not restart from zero.",
    )
  }

  return [
    "After restart:",
    "",
    "1. Start OpenCode with the CTF plugin/config enabled.",
    "2. Run:",
    "",
    "/ctf-expert",
    "",
    challenge,
    "Use Team Mode and Evidence.md.",
    ...resumeHints,
  ].join("\n")
}

export type FormatExpertReadinessFailureOptions = ExpertRecoveryOptions & {
  /** Optional note about current agent / session surface. */
  sessionNote?: string
}

/** Multi-line fail-fast message for /ctf-expert when the runtime is not ready. */
export function formatExpertReadinessFailure(
  report: ExpertReadinessReport,
  opts: FormatExpertReadinessFailureOptions = {},
): string {
  const missing = uniqueSorted(report.missingTools)
  const supportMissing = uniqueSorted(report.missingSupportTools)
  const packs = report.toolPacks.length ? JSON.stringify(report.toolPacks) : "(defaults)"
  const expertPacks = report.expertToolPacks.length
    ? JSON.stringify(report.expertToolPacks)
    : "(none)"

  const lines: string[] = [
    "CTF Expert is configured but not active in this session.",
    "",
    "Missing required tools:",
  ]

  if (missing.length) {
    for (const name of missing) lines.push(`- ${name}`)
  } else if (!report.teamModeEnabled) {
    lines.push("- (team runtime tools are not registered while team_mode.enabled=false)")
  } else {
    lines.push("- (none listed — see checks below)")
  }

  if (supportMissing.length) {
    lines.push("", "Missing support tools (non-blocking):")
    for (const name of supportMissing) lines.push(`- ${name}`)
  }

  lines.push(
    "",
    "Detected config:",
    `- ${report.configPath ?? "(no opencode-for-ctf.jsonc found; using defaults)"}`,
    `- team_mode.enabled=${report.teamModeEnabled}`,
    `- team_mode.max_workers=${report.maxWorkers}`,
    `- tool_packs=${packs}`,
    `- expert_tool_packs=${expertPacks}`,
  )

  if (opts.sessionNote) {
    lines.push(`- session: ${opts.sessionNote}`)
  }

  lines.push(
    "",
    "Likely cause:",
    "- This session was started before the config was applied, or team_mode/tool packs are not active in the process registry.",
    "- OpenCode cannot hot-load the CTF tool registry; config changes require a restart.",
    "",
    "Scope note:",
    "- Expert Mode hard-depends only on Team Mode + Evidence workflow tools.",
    "- External binaries such as ida, jadx, ghidra, apktool, and frida are route-specific soft dependencies; load them only when the current solve lane needs them.",
    "",
    "Fix:",
    '1. Ensure opencode-for-ctf.jsonc has team_mode.enabled=true (and tool_packs=["all"] for full coverage).',
    "2. Restart OpenCode so the plugin re-registers tools.",
    "3. Invoke /ctf-expert again.",
    "",
    formatExpertRecoverySteps(opts),
    "",
    "Do not substitute ordinary task/delegate concurrency for Team Mode.",
    "Do not continue Expert Mode until preflight passes.",
  )

  return lines.join("\n")
}

/** Best-effort extract of evidence/handoff paths from free-form challenge text. */
export function extractResumeHints(text: string): Pick<ExpertRecoveryOptions, "handoffPath" | "evidencePath"> {
  const expertHandoff = text.match(/(?:^|\s)((?:[A-Za-z]:)?[^\s"'`]*expert-handoff\.md)/i)?.[1]
  const handoff = expertHandoff ?? text.match(/(?:^|\s)((?:[A-Za-z]:)?[^\s"'`]*handoff\.md)/i)?.[1]
  const evidenceFile = text.match(/(?:^|\s)((?:[A-Za-z]:)?[^\s"'`]*Evidence\.md)/)?.[1]
  const evidence = evidenceFile ?? text.match(/(?:^|\s)((?:[A-Za-z]:)?[^\s"'`]*work[\\/]+ctf-evidence[\\/]+[^\s"'`]+)/i)?.[1]
  return {
    handoffPath: handoff,
    evidencePath: evidence,
  }
}
