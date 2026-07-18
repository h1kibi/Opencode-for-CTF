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

export type FamilyReadinessInput = {
  family: CtfFamily
  registeredTools: Iterable<string>
  enabledToolPacks: string[]
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
  }
}

export function evaluateAllFamilyReadiness(input: {
  registeredTools: Iterable<string>
  enabledToolPacks: string[]
}): FamilyReadinessReport[] {
  return CTF_FAMILIES.map((family) =>
    evaluateFamilyReadiness({
      family,
      registeredTools: input.registeredTools,
      enabledToolPacks: input.enabledToolPacks,
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
  if (report.missingHeavyMcps.length) {
    lines.push(`- missing requestable MCPs: ${report.missingHeavyMcps.join(", ")}`)
  }
  return lines.join("\n")
}
