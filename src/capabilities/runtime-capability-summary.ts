import { evaluateExpertReadiness } from "../expert-readiness.ts"
import { buildFamilyCapabilityMatrix } from "./family-capability-view.ts"
import { explainToolVisibility } from "./tool-visibility.ts"

export type RuntimeCapabilitySummary = {
  expertReady: boolean
  expertReadinessStatus: ReturnType<typeof evaluateExpertReadiness>["status"]
  expertReadinessReasons: string[]
  enabledPacks: string[]
  exportedToolCount: number
  fastVisibleToolCount: number
  expertVisibleToolCount: number
  family: ReturnType<typeof buildFamilyCapabilityMatrix>
}

export function buildRuntimeCapabilitySummary(args: {
  registeredTools: string[]
  enabledPacks: string[]
  teamModeEnabled: boolean
  maxWorkers: number
  toolPacks?: string[]
  expertToolPacks?: string[]
  configPath?: string | null
}): RuntimeCapabilitySummary {
  const expert = evaluateExpertReadiness({
    registeredTools: args.registeredTools,
    teamModeEnabled: args.teamModeEnabled,
    maxWorkers: args.maxWorkers,
    toolPacks: args.toolPacks,
    expertToolPacks: args.expertToolPacks,
    configPath: args.configPath,
  })
  const fastVisibleToolCount = args.registeredTools.filter(
    (toolName) =>
      explainToolVisibility({
        toolName,
        agentName: "ctf-fast",
        enabledPacks: args.enabledPacks,
        exportedToolNames: args.registeredTools,
      }).visible,
  ).length
  const expertVisibleToolCount = args.registeredTools.filter(
    (toolName) =>
      explainToolVisibility({
        toolName,
        agentName: "ctf-expert",
        enabledPacks: args.enabledPacks,
        exportedToolNames: args.registeredTools,
      }).visible,
  ).length
  return {
    expertReady: expert.ready,
    expertReadinessStatus: expert.status,
    expertReadinessReasons: expert.reasons,
    enabledPacks: [...new Set(args.enabledPacks)].sort(),
    exportedToolCount: args.registeredTools.length,
    fastVisibleToolCount,
    expertVisibleToolCount,
    family: buildFamilyCapabilityMatrix({
      registeredTools: args.registeredTools,
      enabledToolPacks: args.enabledPacks,
    }),
  }
}
