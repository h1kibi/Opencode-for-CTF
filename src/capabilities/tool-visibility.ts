import { packForTool, type ToolPackId } from "../tool-packs.ts"
import {
  toolAllowedForAgent,
  toolAllowedForSubagent,
  isCtfSubagent,
} from "../agent-equipment-policy.ts"

export type ToolVisibilityCategory =
  "visible" | "pack_not_enabled" | "tool_not_in_process_registry" | "fast_surface_blocked" | "subagent_gate_blocked"

export type ToolVisibilityExplanation = {
  visible: boolean
  category: ToolVisibilityCategory
  reasons: string[]
}

export function explainToolVisibility(args: {
  toolName: string
  agentName?: string | null
  enabledPacks: Iterable<string>
  exportedToolNames: Iterable<string>
}): ToolVisibilityExplanation {
  const enabled = new Set([...args.enabledPacks])
  const exported = new Set([...args.exportedToolNames])
  const pack = packForTool(args.toolName)
  const reasons: string[] = []

  if (!enabled.has(pack)) {
    reasons.push(`${args.toolName} belongs to pack ${pack}, which is not enabled.`)
    return {
      visible: false,
      category: "pack_not_enabled",
      reasons,
    }
  }

  if (!exported.has(args.toolName)) {
    reasons.push(`${args.toolName} is not present in the exported process tool registry.`)
    return {
      visible: false,
      category: "tool_not_in_process_registry",
      reasons,
    }
  }

  if (!toolAllowedForAgent(args.toolName, args.agentName)) {
    reasons.push(`${args.toolName} is blocked on the current fast surface.`)
    return {
      visible: false,
      category: "fast_surface_blocked",
      reasons,
    }
  }

  // Subagent heavy tool gate: block cross-family tools, but allow same-family
  // tools to show as visible (they need expert approval, but they're not blocked
  // from visibility - the subagent can request them via ctf-dynamic-mcp-advisor)
  if (
    args.agentName &&
    isCtfSubagent(args.agentName) &&
    !toolAllowedForSubagent(args.toolName, args.agentName, args.enabledPacks)
  ) {
    // Check if tool belongs to the same family as the subagent
    const toolFamily = args.toolName.match(/^ctf-([^-]+)-/)?.[1]
    const agentFamily = args.agentName.replace(/^ctf-/, '')
    const isSameFamily = toolFamily === agentFamily
    
    if (!isSameFamily) {
      reasons.push(`${args.toolName} is outside the lightweight tool surface for subagent ${args.agentName}.`)
      return {
        visible: false,
        category: "subagent_gate_blocked",
        reasons,
      }
    }
    // Same-family heavy tools fall through to visible
  }

  reasons.push(`${args.toolName} is exported and allowed for the current surface.`)
  return {
    visible: true,
    category: "visible",
    reasons,
  }
}

export function summarizeToolVisibilityMatrix(args: {
  toolNames: Iterable<string>
  agentName?: string | null
  enabledPacks: Iterable<string>
  exportedToolNames: Iterable<string>
}) {
  const result: Record<ToolVisibilityCategory, string[]> = {
    visible: [],
    pack_not_enabled: [],
    tool_not_in_process_registry: [],
    fast_surface_blocked: [],
    subagent_gate_blocked: [],
  }
  for (const toolName of args.toolNames) {
    const explanation = explainToolVisibility({
      toolName,
      agentName: args.agentName,
      enabledPacks: args.enabledPacks,
      exportedToolNames: args.exportedToolNames,
    })
    result[explanation.category].push(toolName)
  }
  for (const key of Object.keys(result) as ToolVisibilityCategory[]) result[key].sort()
  return result
}

export function normalizeEnabledPacks(enabledPacks: Iterable<string>): ToolPackId[] {
  return [...new Set([...enabledPacks].map((pack) => pack as ToolPackId))].sort()
}
