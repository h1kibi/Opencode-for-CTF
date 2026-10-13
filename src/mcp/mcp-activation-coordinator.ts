/**
 * MCP Activation Coordinator — unified lifecycle manager for all MCP activation paths.
 *
 * Consolidates lease claiming, connection, and disconnection logic that was previously
 * scattered across skill-mcp-manager, mcp-runtime-adapter, and tool-hooks.
 *
 * Design:
 *   - Single entry point for all MCP state transitions
 *   - Coordinates between skill bindings and runtime agent profiles
 *   - Centralizes lease lifecycle (pending → connecting → connected → disconnecting)
 *   - Simplifies callers by hiding coordination complexity
 *
 * Three activation modes:
 *   1. Skill-driven: skill MCP bindings activate when a skill loads
 *   2. Agent-default: agent profiles activate light+medium servers
 *   3. Dynamic request: explicit heavy server requests via approve/deny workflow
 */

import type { OpencodeClient } from "@opencode-ai/sdk"
import type { RuntimeMcpConfig } from "../skill-mcp-registry.ts"
import { bindingsForSkill } from "../skill-mcp-registry.ts"
import { getAgentDefaults } from "../agent-mcp-profiles.ts"
import {
  ensureSkillBindingLease,
  ensureNamedServerLeases,
  releaseSkillMcpLeases,
} from "../skill-mcp-manager.ts"
import {
  clearMcpActivationIssues,
  recordMcpActivationIssue,
  metaToRuntimeConfig,
} from "../dynamic-mcp-manager.ts"
import { lookupMcpServer, envPrerequisitesSatisfied } from "../mcp-server-registry.ts"

// ============================================================================
// Types
// ============================================================================

export type ActivationMode = "skill" | "agent-default" | "request"

export type ActivationRequest = {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  agentName: string
  mode: ActivationMode
}

export type SkillActivationRequest = ActivationRequest & {
  mode: "skill"
  skillName: string
}

export type ServerActivationRequest = ActivationRequest & {
  mode: "agent-default" | "request"
  servers: Array<{
    serverName: string
    config: RuntimeMcpConfig
    disconnectWhenIdle?: boolean
  }>
}

export type ActivationResult = {
  activated: string[]
  shared: string[]
  skipped: string[]
  failed: Array<{ serverName: string; message: string }>
}

export type ReleaseResult = {
  released: string[]
  retained: string[]
  skipped: string[]
  disconnectFailed: string[]
}

// ============================================================================
// Activation
// ============================================================================

/**
 * Activate MCP servers from skill bindings.
 *
 * Called when a skill loads; looks up registered bindings and activates
 * each server through the skill lease mechanism.
 */
export async function activateSkillMcps(
  request: SkillActivationRequest,
): Promise<ActivationResult> {
  const bindings = bindingsForSkill(request.skillName)
  
  const activated: string[] = []
  const shared: string[] = []
  const failed: Array<{ serverName: string; message: string }> = []

  for (const binding of bindings) {
    try {
      const result = await ensureSkillBindingLease({
        client: request.client,
        worktree: request.worktree,
        directory: request.directory,
        sessionID: request.sessionID,
        skillName: request.skillName,
        binding,
      })
      activated.push(...result.activated)
      shared.push(...result.shared)
    } catch (error) {
      failed.push({
        serverName: binding.serverName,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Record activation issues
  const successfulServers = [...new Set([...activated, ...shared])]
  if (successfulServers.length) {
    await clearMcpActivationIssues({
      worktree: request.worktree,
      sessionID: request.sessionID,
      agentName: request.agentName,
      serverNames: successfulServers,
      phase: "skill",
    })
  }
  for (const failure of failed) {
    await recordMcpActivationIssue({
      worktree: request.worktree,
      sessionID: request.sessionID,
      agentName: request.agentName,
      serverName: failure.serverName,
      phase: "skill",
      error: failure.message,
    })
  }

  return {
    activated,
    shared,
    skipped: [],
    failed,
  }
}

/**
 * Activate a set of named servers (agent defaults or request approvals).
 *
 * Used by both agent-default profiles and the dynamic request/approve flow.
 * Resolves each server through the registry, validates prerequisites,
 * and claims leases through the skill manager.
 */
export async function activateNamedServers(
  request: ServerActivationRequest,
): Promise<ActivationResult> {
  const activated: string[] = []
  const shared: string[] = []
  const skipped: string[] = []
  const failed: Array<{ serverName: string; message: string }> = []

  // Validate and prepare servers
  const validServers: Array<{
    serverName: string
    config: RuntimeMcpConfig
    disconnectWhenIdle?: boolean
  }> = []

  for (const server of request.servers) {
    const meta = lookupMcpServer(server.serverName)
    if (!meta) {
      skipped.push(`${server.serverName} (not in registry)`)
      continue
    }

    const prereq = envPrerequisitesSatisfied(meta)
    if (!prereq.ok) {
      skipped.push(`${server.serverName} (missing env: ${prereq.missing.join(", ")})`)
      continue
    }

    validServers.push(server)
  }

  // Claim leases for valid servers
  if (validServers.length > 0) {
    const skillName =
      request.mode === "agent-default"
        ? `agent-default:${request.agentName}`
        : `agent-request:${request.agentName}`

    try {
      const result = await ensureNamedServerLeases({
        client: request.client,
        worktree: request.worktree,
        directory: request.directory,
        sessionID: request.sessionID,
        skillName,
        servers: validServers,
      })
      activated.push(...result.activated)
      shared.push(...result.shared)
      failed.push(...result.failed)
    } catch (error) {
      for (const server of validServers) {
        failed.push({
          serverName: server.serverName,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  // Record activation issues
  const phase = request.mode === "agent-default" ? "agent_default" : "request"
  const successfulServers = [...new Set([...activated, ...shared])]
  if (successfulServers.length) {
    await clearMcpActivationIssues({
      worktree: request.worktree,
      sessionID: request.sessionID,
      agentName: request.agentName,
      serverNames: successfulServers,
      phase,
    })
  }
  for (const failure of failed) {
    await recordMcpActivationIssue({
      worktree: request.worktree,
      sessionID: request.sessionID,
      agentName: request.agentName,
      serverName: failure.serverName,
      phase,
      error: failure.message,
    })
  }

  return { activated, shared, skipped, failed }
}

/**
 * Activate agent default MCP profile (light + medium servers).
 *
 * Filters heavy servers from the agent's profile and activates the rest.
 * This is the primary entry point for agent-driven activation in tool-hooks.
 */
export async function activateAgentProfile(
  request: Omit<ActivationRequest, "mode">,
): Promise<ActivationResult> {
  const serverNames = getAgentDefaults(request.agentName)
  
  const servers: Array<{
    serverName: string
    config: RuntimeMcpConfig
    disconnectWhenIdle?: boolean
  }> = []

  for (const serverName of serverNames) {
    const meta = lookupMcpServer(serverName)
    if (!meta) continue
    if (meta.weight === "heavy") continue

    const config = metaToRuntimeConfig(meta)
    if (!config) continue

    servers.push({
      serverName,
      config,
      disconnectWhenIdle: false,
    })
  }
  const result = await activateNamedServers({
    ...request,
    mode: "agent-default",
    servers,
  })

  // Return full result including shared servers
  return {
    activated: result.activated,
    shared: result.shared,
    skipped: result.skipped,
    failed: result.failed,
  }
}

/**
 * Activate servers from the registry by name (for request approval flow).
 *
 * Looks up each server in the registry, converts to runtime config,
 * and activates through the named server lease path.
 */
export async function activateRegistryServers(
  request: Omit<ActivationRequest, "mode"> & { serverNames: string[] },
): Promise<ActivationResult> {
  const servers: Array<{
    serverName: string
    config: RuntimeMcpConfig
    disconnectWhenIdle?: boolean
  }> = []

  for (const serverName of request.serverNames) {
    const meta = lookupMcpServer(serverName)
    if (!meta) continue

    const config = metaToRuntimeConfig(meta)
    if (!config) continue

    servers.push({
      serverName,
      config,
      disconnectWhenIdle: meta.weight === "heavy",
    })
  }

  return activateNamedServers({
    ...request,
    mode: "request",
    servers,
  })
}

// ============================================================================
// Release
// ============================================================================

/**
 * Release MCP servers for a session (optionally filtered by skill).
 *
 * Unified entry point for disconnection that delegates to the skill manager's
 * lease release logic. Handles the full disconnect lifecycle including
 * compensation for failed disconnects.
 */
export async function releaseMcps(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName?: string
}): Promise<ReleaseResult> {
  return releaseSkillMcpLeases(args)
}

/**
 * Release all MCP servers for a session (both skill and agent leases).
 *
 * Called when a session ends to clean up all MCP state.
 */
export async function releaseAllSessionMcps(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
}): Promise<void> {
  await releaseSkillMcpLeases({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID: args.sessionID,
  })
}
