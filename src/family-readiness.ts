import type { CtfFamily } from "./types.ts"
import { getAgentDefaults } from "./agent-mcp-profiles.ts"
import {
  CTF_FAMILIES,
  FAMILY_CAPABILITY_CONTRACTS,
  type FamilyCapabilityCheck,
  type FamilyCapabilityContract,
  type FamilyCapabilityStatus,
} from "./family-capability-contracts.ts"
import { lookupMcpServer } from "./mcp-server-registry.ts"
import { isToolPackId, type ToolPackId } from "./tool-packs.ts"

export type FamilyReadinessCheck = FamilyCapabilityCheck & {
  ok: boolean
}

export type EnvironmentProbeResult = {
  ok: boolean
  detail?: string
  version?: string
  behaviorOk?: boolean
  executed?: boolean
}

export type StartupEnvironmentSummary = {
  os: "windows" | "linux" | "macos" | "unknown"
  shell: "powershell" | "bash" | "sh" | "zsh" | "cmd" | "unknown"
  substrate: "kali" | "native-linux" | "docker-capable" | "unknown"
  guidance: string[]
}

export type FamilyReadinessInput = {
  family: CtfFamily
  registeredTools: Iterable<string>
  enabledToolPacks: string[]
  /** Optional real environment probe results keyed by contract envDependency id. */
  environmentProbes?: Record<string, EnvironmentProbeResult>
}

export type FamilyReadinessReport = {
  family: CtfFamily
  status: FamilyCapabilityStatus
  checks: FamilyReadinessCheck[]
  missingRequiredTools: string[]
  missingSupportTools: string[]
  missingToolPacks: ToolPackId[]
  missingDefaultMcps: string[]
  missingHeavyMcps: string[]
  missingCapabilities: string[]
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort()
}

function familyAgentName(family: CtfFamily): string {
  return `ctf-${family}`
}

function baselineChecks(contract: FamilyCapabilityContract): FamilyReadinessCheck[] {
  return contract.readinessChecks.map((check) => ({ ...check, ok: true }))
}

function truthyDetail(probe: EnvironmentProbeResult | undefined): string {
  return (probe?.detail || "").toLowerCase()
}

export function summarizeStartupEnvironment(
  environmentProbes?: Record<string, EnvironmentProbeResult>,
): StartupEnvironmentSummary {
  const osProbe = environmentProbes?.["env:os"]
  const shellProbe = environmentProbes?.["env:shell"]
  const kaliProbe = environmentProbes?.["env:kali"]
  const wslProbe = environmentProbes?.["env:wsl"]
  const dockerProbe = environmentProbes?.["env:docker"]

  const osDetail = truthyDetail(osProbe)
  const shellDetail = truthyDetail(shellProbe)

  let os: StartupEnvironmentSummary["os"] = "unknown"
  if (osProbe?.ok) {
    if (osDetail.includes("windows") || osDetail.includes("win32")) os = "windows"
    else if (osDetail.includes("mac") || osDetail.includes("darwin")) os = "macos"
    else if (osDetail.includes("linux")) os = "linux"
  }

  let shell: StartupEnvironmentSummary["shell"] = "unknown"
  if (shellProbe?.ok) {
    if (shellDetail.includes("powershell") || shellDetail.includes("pwsh")) shell = "powershell"
    else if (shellDetail.includes("bash")) shell = "bash"
    else if (shellDetail.includes("zsh")) shell = "zsh"
    else if (shellDetail.includes("cmd")) shell = "cmd"
    else if (shellDetail.includes("sh")) shell = "sh"
  }

  let substrate: StartupEnvironmentSummary["substrate"] = "unknown"
  if (kaliProbe?.ok) substrate = "kali"
  else if (wslProbe?.ok || os === "linux") substrate = "native-linux"
  else if (dockerProbe?.ok) substrate = "docker-capable"

  const guidance: string[] = []
  if (substrate === "kali") {
    guidance.push("Detected Kali Linux — remember Kali's built-in security tooling is likely available, so prefer native system tools before inventing workarounds.")
  }
  if (os === "windows" || shell === "powershell") {
    guidance.push("Detected Windows/PowerShell — for fast probing, default to PowerShell-safe syntax, use `curl.exe` when literal curl semantics matter, avoid bash/heredoc examples like `python - <<'PY'`, use `python -c` for trivial snippets, and prefer `ctf-python-inline` or small script files when quoting, redirection, loops, or multi-line HTTP payloads would make one-liners fragile.")
  }
  if (wslProbe?.ok) {
    guidance.push("Detected a Linux environment launched via WSL — keep Linux-heavy probes inside that Linux environment and use Linux-native bash/heredoc patterns there instead of assembling them in PowerShell first.")
  }
  if (!guidance.length && substrate === "native-linux") {
    guidance.push("Detected native Linux — use the host's native CLI/toolchain directly when it matches the challenge workflow; bash-native pipelines, shell loops, heredocs, and inline `python - <<'PY'` snippets are appropriate here.")
  }

  return { os, shell, substrate, guidance }
}

export function formatStartupEnvironmentSummary(
  environmentProbes?: Record<string, EnvironmentProbeResult>,
): string | undefined {
  const summary = summarizeStartupEnvironment(environmentProbes)
  if (!summary.guidance.length && summary.os === "unknown" && summary.shell === "unknown" && summary.substrate === "unknown") {
    return undefined
  }
  const parts = [
    `os=${summary.os}`,
    `shell=${summary.shell}`,
    `substrate=${summary.substrate}`,
  ]
  const lines = [`Startup environment: ${parts.join(", ")}`]
  for (const note of summary.guidance) lines.push(`- ${note}`)
  return lines.join("\n")
}

export function evaluateFamilyReadiness(input: FamilyReadinessInput): FamilyReadinessReport {
  const contract = FAMILY_CAPABILITY_CONTRACTS[input.family]
  const registered = new Set(
    [...input.registeredTools].map((name) => name.replace(/\.(ts|js)$/, "")).filter(Boolean),
  )
  const packs = new Set(input.enabledToolPacks.filter(isToolPackId))
  const checks = baselineChecks(contract)

  const missingToolPacks = contract.expectedToolPacks.filter((pack) => !packs.has(pack))
  for (const pack of contract.expectedToolPacks) {
    const ok = packs.has(pack)
    checks.push({
      id: `pack:${pack}`,
      ok,
      required: pack !== "core",
      detail: ok ? `${pack} tool pack enabled` : `${pack} tool pack missing`,
      remediation: ok ? undefined : `Enable tool_packs including "${pack}" and restart OpenCode.`,
    })
  }

  const missingRequiredTools = contract.requiredTools.filter((tool) => !registered.has(tool))
  for (const tool of contract.requiredTools) {
    const ok = registered.has(tool)
    checks.push({
      id: `tool:${tool}`,
      ok,
      required: true,
      detail: ok ? `${tool} registered` : `${tool} missing from process registry`,
      remediation: ok ? undefined : `Ensure the ${input.family} family packs are active, then restart OpenCode.`,
    })
  }

  const missingSupportTools = contract.supportTools.filter((tool) => !registered.has(tool))
  for (const tool of contract.supportTools) {
    const ok = registered.has(tool)
    checks.push({
      id: `support:${tool}`,
      ok,
      required: false,
      detail: ok ? `${tool} registered` : `${tool} missing (support tool)`,
      remediation: ok ? undefined : `Load the ${input.family} family helpers or rely on the documented fallback path.`,
    })
  }

  const agentDefaults = getAgentDefaults(familyAgentName(input.family))
  const missingDefaultMcps = contract.defaultMcps.filter((serverId) => !agentDefaults.includes(serverId))
  for (const serverId of contract.defaultMcps) {
    const ok = agentDefaults.includes(serverId)
    checks.push({
      id: `mcp-default:${serverId}`,
      ok,
      required: true,
      detail: ok ? `${serverId} included in ${familyAgentName(input.family)} defaults` : `${serverId} missing from agent defaults`,
      remediation: ok ? undefined : `Align ${familyAgentName(input.family)} MCP defaults with the family capability contract.`,
    })
  }

  const missingHeavyMcps = contract.requestableHeavyMcps.filter((serverId) => !lookupMcpServer(serverId))
  for (const serverId of contract.requestableHeavyMcps) {
    const ok = lookupMcpServer(serverId) !== undefined
    checks.push({
      id: `mcp-requestable:${serverId}`,
      ok,
      required: false,
      detail: ok ? `${serverId} available for request/approval` : `${serverId} missing from MCP registry`,
      remediation: ok ? undefined : `Register ${serverId} in MCP_SERVER_REGISTRY or remove it from the family contract.`,
    })
  }

  const missingCapabilities: string[] = []
  for (const dependency of contract.envDependencies ?? []) {
    const probe = input.environmentProbes?.[dependency.id]
    const ok = probe?.ok === true && probe.behaviorOk !== false
    const required = dependency.id.includes("docker") && input.family === "pwn"
    checks.push({
      id: dependency.id,
      ok,
      required,
      detail: probe
        ? `${dependency.label}: ${probe.detail ?? (ok ? "available" : "unavailable")}${probe.version ? ` (${probe.version})` : ""}`
        : `${dependency.label}: probe not executed`,
      remediation: ok ? undefined : dependency.setupCommand,
    })
    if (!ok) missingCapabilities.push(dependency.id)
  }

  const hardFailures = checks.filter((check) => check.required && !check.ok)
  const softFailures = checks.filter((check) => !check.required && !check.ok)
  const status: FamilyCapabilityStatus = hardFailures.length
    ? "blocked"
    : softFailures.length
      ? "degraded"
      : "ready"

  return {
    family: input.family,
    status,
    checks,
    missingRequiredTools: uniqueSorted(missingRequiredTools),
    missingSupportTools: uniqueSorted(missingSupportTools),
    missingToolPacks,
    missingDefaultMcps: uniqueSorted(missingDefaultMcps),
    missingHeavyMcps: uniqueSorted(missingHeavyMcps),
    missingCapabilities: uniqueSorted(missingCapabilities),
  }
}

export function evaluateAllFamilyReadiness(input: {
  registeredTools: Iterable<string>
  enabledToolPacks: string[]
  environmentProbes?: Record<string, EnvironmentProbeResult>
}): FamilyReadinessReport[] {
  return CTF_FAMILIES.map((family) =>
    evaluateFamilyReadiness({
      family,
      registeredTools: input.registeredTools,
      enabledToolPacks: input.enabledToolPacks,
      environmentProbes: input.environmentProbes,
    }),
  )
}

export function formatFamilyReadinessSummary(report: FamilyReadinessReport): string {
  const header = `[${report.family}] ${report.status.toUpperCase()}`
  const lines = [header]
  if (report.missingToolPacks.length) {
    lines.push(`- missing packs: ${report.missingToolPacks.join(", ")}`)
  }
  if (report.missingRequiredTools.length) {
    lines.push(`- missing required tools: ${report.missingRequiredTools.join(", ")}`)
  }
  if (report.missingSupportTools.length) {
    lines.push(`- missing support tools: ${report.missingSupportTools.join(", ")}`)
  }
  if (report.missingDefaultMcps.length) {
    lines.push(`- missing default MCPs: ${report.missingDefaultMcps.join(", ")}`)
  }
  if (report.missingCapabilities.length) {
    lines.push(`- missing capabilities: ${report.missingCapabilities.join(", ")}`)
  }
  if (report.missingHeavyMcps.length) {
    lines.push(`- missing requestable MCPs: ${report.missingHeavyMcps.join(", ")}`)
  }
  return lines.join("\n")
}
