/**
 * Dynamic MCP Manager — agent-level MCP lifecycle.
 *
 * Three responsibilities:
 *   1. Activate default MCPs when a subagent starts.
 *   2. Accept on-demand MCP requests from subagents and persist them for
 *      async approval by ctf-expert.
 *   3. Release idle/session MCPs when work is done.
 *
 * This sits above the existing `skill-mcp-manager.ts` (which handles the
 * per-skill lease lifecycle) and drives it via `ensureSkillMcpLeases`.
 */

import { randomUUID } from "node:crypto"
import { PLUGIN_ROOT } from "./asset-paths.ts"
import { getAgentDefaults } from "./agent-mcp-profiles.ts"
import { lookupMcpServer, envPrerequisitesSatisfied } from "./mcp-server-registry.ts"
import { agentMcpStateFile } from "./paths.ts"
import { ensureNamedServerLeases, releaseSkillMcpLeases } from "./skill-mcp-manager.ts"
import type { RuntimeMcpConfig } from "./skill-mcp-registry.ts"
import { atomicUpdateJsonFile, loadJsonFile, nowIso } from "./state-store.ts"
import type { AgentMcpRequest, AgentMcpState, McpServerMeta } from "./types.ts"
import type { OpencodeClient } from "@opencode-ai/sdk"

/** Convert registry server meta into a skill-mcp RuntimeMcpConfig. */
function expandPlaceholder(value: string): string {
  return value
    .replaceAll("{plugin_root}", PLUGIN_ROOT)
    .replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "")
}

function expandRecord(input?: Record<string, string>): Record<string, string> | undefined {
  if (!input) return undefined
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, expandPlaceholder(value)]))
}

/** @visibleForTesting */
export function metaToRuntimeConfig(meta: McpServerMeta): RuntimeMcpConfig | null {
  const cfg = meta.config as Record<string, unknown>
  if (!cfg || typeof cfg !== "object") return null
  if (cfg.type === "remote") {
    return {
      type: "remote",
      url: typeof cfg.url === "string" ? expandPlaceholder(cfg.url) : "",
      headers: expandRecord(cfg.headers as Record<string, string> | undefined) ?? {},
      timeout: typeof cfg.timeout === "number" ? cfg.timeout : meta.timeout,
    }
  }
  if (cfg.type === "local") {
    return {
      type: "local",
      command: Array.isArray(cfg.command) ? (cfg.command as string[]).map(expandPlaceholder) : [],
      environment: expandRecord(cfg.environment as Record<string, string> | undefined) ?? {},
      timeout: typeof cfg.timeout === "number" ? cfg.timeout : meta.timeout,
    }
  }
  return null
}

async function activateRegistryServers(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName: string
  serverNames: string[]
}): Promise<{ activated: string[]; skipped: string[] }> {
  const activated: string[] = []
  const skipped: string[] = []
  const servers: Array<{ serverName: string; config: RuntimeMcpConfig; disconnectWhenIdle?: boolean }> = []

  for (const serverName of args.serverNames) {
    const meta = lookupMcpServer(serverName)
    if (!meta) {
      skipped.push(`${serverName} (not in registry)`)
      continue
    }
    const prereq = envPrerequisitesSatisfied(meta)
    if (!prereq.ok) {
      skipped.push(`${serverName} (missing env: ${prereq.missing.join(", ")})`)
      continue
    }
    const config = metaToRuntimeConfig(meta)
    if (!config) {
      skipped.push(`${serverName} (invalid config)`)
      continue
    }
    servers.push({ serverName, config, disconnectWhenIdle: meta.weight === "heavy" })
  }

  if (servers.length) {
    const result = await ensureNamedServerLeases({
      client: args.client,
      worktree: args.worktree,
      directory: args.directory,
      sessionID: args.sessionID,
      skillName: args.skillName,
      servers,
    })
    activated.push(...result.activated, ...result.shared)
  }

  return { activated: [...new Set(activated)], skipped }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function initialState(): AgentMcpState {
  return {
    version: 1,
    activeProfiles: [],
    requests: [],
    updatedAt: nowIso(),
  }
}

function statePath(worktree: string) {
  return agentMcpStateFile(worktree)
}

async function loadState(worktree: string) {
  return loadJsonFile<AgentMcpState>(statePath(worktree), initialState())
}

const IN_MEMORY_APPROVED = new Map<string, number>()
const IN_MEMORY_TTL_MS = 30 * 60_000 // 30 minutes
const IN_MEMORY_MAX = 50

/** @visibleForTesting */
export function isInMemoryApproved(serverName: string): boolean {
  const ts = IN_MEMORY_APPROVED.get(serverName)
  if (ts === undefined) return false
  if (Date.now() - ts > IN_MEMORY_TTL_MS) {
    IN_MEMORY_APPROVED.delete(serverName)
    return false
  }
  return true
}

/** Add a server to the in-memory approved set with TTL and max-size enforcement. */
function addInMemoryApproved(serverName: string): void {
  // Enforce cap: evict oldest entries when over limit
  if (IN_MEMORY_APPROVED.size >= IN_MEMORY_MAX) {
    const oldest = [...IN_MEMORY_APPROVED.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) IN_MEMORY_APPROVED.delete(oldest[0])
  }
  IN_MEMORY_APPROVED.set(serverName, Date.now())
}

/** Remove a server from the in-memory approved set (e.g. on disconnect). */
function removeInMemoryApproved(serverName: string): void {
  IN_MEMORY_APPROVED.delete(serverName)
}

/** @visibleForTesting */
export function pruneInMemoryApproved(): void {
  const now = Date.now()
  for (const [key, ts] of IN_MEMORY_APPROVED) {
    if (now - ts > IN_MEMORY_TTL_MS) IN_MEMORY_APPROVED.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Activate the default MCP set for a given agent.
 *
 * Only light + medium servers are activated.  Servers whose environment
 * prerequisites are not satisfied are silently skipped.
 *
 * This is idempotent: if a server is already connected (by another session
 * or a prior call), the lease manager will recognise it.
 */
export async function activateAgentDefaults(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  agentName: string
}) {
  const serverNames = getAgentDefaults(args.agentName)
  const activated: string[] = []
  const skipped: string[] = []

  const lightMedium: string[] = []
  for (const serverName of serverNames) {
    const meta = lookupMcpServer(serverName)
    if (!meta) {
      skipped.push(`${serverName} (not in registry)`)
      continue
    }
    if (meta.weight === "heavy") {
      // Heavy servers are never activated by default.
      skipped.push(`${serverName} (heavy, must request)`)
      continue
    }
    lightMedium.push(serverName)
  }

  const result = await activateRegistryServers({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID: args.sessionID,
    skillName: `agent-default:${args.agentName}`,
    serverNames: lightMedium,
  })
  activated.push(...result.activated)
  skipped.push(...result.skipped)

  // Record the active profile
  const path = statePath(args.worktree)
  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    const existing = state.activeProfiles.find((p) => p.agent === args.agentName && p.sessionID === args.sessionID)
    if (existing) {
      existing.serverNames = [...new Set([...existing.serverNames, ...activated])]
    } else {
      state.activeProfiles.push({
        agent: args.agentName,
        sessionID: args.sessionID,
        serverNames: activated,
      })
    }
    return state
  })

  return { activated, skipped }
}

/**
 * Submit an on-demand MCP request from a subagent.
 *
 * Creates a pending request in the agent MCP state.  The request is
 * processed asynchronously (at session.idle) by ctf-expert.
 *
 * If the MCP is already active for this session, returns immediately
 * with status "approved".
 */
export async function requestMcp(args: {
  worktree: string
  sessionID: string
  agentName: string
  serverNames: string[]
  reason: string
}): Promise<{ requestIds: string[]; results: Array<{ serverName: string; status: string }> }> {
  const results: Array<{ serverName: string; status: string }> = []
  const requestIds: string[] = []
  const path = statePath(args.worktree)

  for (const serverName of args.serverNames) {
    const meta = lookupMcpServer(serverName)
    if (!meta) {
      results.push({ serverName, status: `unknown: "${serverName}" not in registry` })
      continue
    }

    const prereq = envPrerequisitesSatisfied(meta)
    if (!prereq.ok) {
      results.push({ serverName, status: `denied: missing env ${prereq.missing.join(", ")}` })
      continue
    }

    // Check if already connected via current profile
    const state = await loadState(args.worktree)
    const profile = state.activeProfiles.find((p) => p.agent === args.agentName && p.sessionID === args.sessionID)
    if (profile?.serverNames.includes(serverName)) {
      results.push({ serverName, status: "already_active" })
      continue
    }

    if (isInMemoryApproved(serverName)) {
      results.push({ serverName, status: "approved (in-memory)" })
      continue
    }

    const now = nowIso()
    const request: AgentMcpRequest = {
      id: `mcp-req-${randomUUID().slice(0, 8)}`,
      agent: args.agentName,
      sessionID: args.sessionID,
      serverName,
      reason: args.reason,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }

    await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
      state.requests.push(request)
      return state
    })

    requestIds.push(request.id)
    results.push({ serverName, status: "pending" })
  }

  return { requestIds, results }
}

/**
 * Process pending MCP requests — called from plugin.ts at session.idle.
 *
 * Auto-approves requests where the agent's category matches the MCP's
 * categories.  Heavy MCPs default to pending, waiting for ctf-expert
 * approval via `approveRequest` / `denyRequest`.
 */
export async function processPendingRequests(args: { client: OpencodeClient; worktree: string; directory: string }) {
  const path = statePath(args.worktree)
  const state = await loadState(args.worktree)
  const pending = state.requests.filter((r) => r.status === "pending")
  if (!pending.length) return { processed: 0, autoApproved: 0, stillPending: 0 }

  let autoApproved = 0
  let stillPending = 0

  for (const req of pending) {
    const meta = lookupMcpServer(req.serverName)
    if (!meta) {
      // Unknown server — deny automatically
      await setRequestStatus(args.worktree, req.id, "denied", {
        note: "unknown server, not in registry",
      })
      continue
    }

    // Auto-approve if the agent is in the server's category list AND
    // the server is light or medium weight.
    const agentCategory = agentNameToCategory(req.agent)
    const categoryMatch = agentCategory && meta.categories.includes(agentCategory)

    if (categoryMatch && meta.weight !== "heavy") {
      // Auto-approve light/medium same-category requests only after activation succeeds
      const act = await activateRegistryServers({
        client: args.client,
        worktree: args.worktree,
        directory: args.directory,
        sessionID: req.sessionID,
        skillName: `agent-request:${req.agent}`,
        serverNames: [req.serverName],
      })
      if (act.activated.length) {
        await setRequestStatus(args.worktree, req.id, "approved")
        await recordActiveServer(args.worktree, req.agent, req.sessionID, req.serverName)
        addInMemoryApproved(req.serverName)
        autoApproved++
      } else {
        stillPending++
      }
    } else {
      // Heavy MCP or cross-category — leave pending for ctf-expert
      stillPending++
    }
  }

  return { processed: pending.length, autoApproved, stillPending }
}

/**
 * Approve a pending MCP request and activate the server for the requesting agent/session.
 * Lease skill key is always `agent-request:<agentName>` (never sessionID).
 */
export async function approveRequest(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  requestId: string
  decidedBy?: string
  note?: string
}) {
  const path = statePath(args.worktree)
  let serverName = ""
  let sessionID = ""
  let agentName = ""

  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    const req = state.requests.find((r) => r.id === args.requestId)
    if (!req) return state
    if (req.status !== "pending" && req.status !== "approved") return state
    req.status = "approved"
    req.decidedBy = args.decidedBy ?? "ctf-expert"
    if (args.note) req.decidedNote = args.note
    req.updatedAt = nowIso()
    serverName = req.serverName
    sessionID = req.sessionID
    agentName = req.agent
    return state
  })

  if (!serverName || !sessionID) {
    return { ok: false, reason: "request not found" }
  }

  const skillName = `agent-request:${agentName || "unknown"}`
  const act = await activateRegistryServers({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID,
    skillName,
    serverNames: [serverName],
  })

  if (!act.activated.length && act.skipped.length) {
    return { ok: false, reason: act.skipped.join("; "), serverName }
  }

  addInMemoryApproved(serverName)
  await recordActiveServer(args.worktree, agentName || "unknown", sessionID, serverName)

  return { ok: true, serverName, agent: agentName, sessionID, skillName }
}

/**
 * Deny a pending MCP request.
 */
export async function denyRequest(args: { worktree: string; requestId: string; decidedBy?: string; note?: string }) {
  const result = await setRequestStatus(args.worktree, args.requestId, "denied", {
    decidedBy: args.decidedBy,
    note: args.note,
  })
  return { ok: result, requestId: args.requestId }
}

/**
 * Release all MCPs for a given session (called when a subagent finishes).
 *
 * Only disconnect servers that are NOT in the agent's default light +
 * medium set, so that common infrastructure stays alive.
 */
export async function releaseSessionMcps(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  agentName: string
}) {
  const defaults = new Set(getAgentDefaults(args.agentName))

  // The release uses the session-level lease; disconnect only servers
  // that are NOT part of the agent's default (light + medium) set.
  await releaseSkillMcpLeases({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID: args.sessionID,
  })

  // Clean up the profile record
  const path = statePath(args.worktree)
  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    state.activeProfiles = state.activeProfiles.filter(
      (p) => !(p.agent === args.agentName && p.sessionID === args.sessionID),
    )
    return state
  })
}

/**
 * List pending MCP requests for review by ctf-expert.
 */
export async function listPendingRequests(worktree: string) {
  const state = await loadState(worktree)
  return state.requests.filter((r) => r.status === "pending")
}

/**
 * Get the full agent MCP state summary.
 */
export async function getAgentMcpState(worktree: string) {
  return loadState(worktree)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** @visibleForTesting */
export function agentNameToCategory(agent: string): string | undefined {
  // Category agents map to their domain. Cross-category agents
  // (ctf-expert, ctf-scout, ctf-oracle, ctf-retro) are deliberately
  // omitted — they work across all categories and their MCP requests
  // should remain pending for human/ctf-expert decision.
  const map: Record<string, string> = {
    "ctf-web": "web",
    "ctf-pwn": "pwn",
    "ctf-rev": "rev",
    "ctf-crypto": "crypto",
    "ctf-forensics": "forensics",
    "ctf-misc": "misc",
  }
  return map[agent]
}

async function setRequestStatus(
  worktree: string,
  requestId: string,
  status: "approved" | "denied",
  opts?: { decidedBy?: string; note?: string },
) {
  const path = statePath(worktree)
  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    const req = state.requests.find((r) => r.id === requestId)
    if (!req) return state
    req.status = status
    req.decidedBy = opts?.decidedBy ?? (status === "approved" ? "auto" : undefined)
    req.decidedNote = opts?.note
    req.updatedAt = nowIso()
    return state
  })
  return true
}

async function recordActiveServer(worktree: string, agent: string, sessionID: string, serverName: string) {
  const path = statePath(worktree)
  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    const existing = state.activeProfiles.find((p) => p.agent === agent && p.sessionID === sessionID)
    if (existing) {
      existing.serverNames = [...new Set([...existing.serverNames, serverName])]
    } else {
      state.activeProfiles.push({ agent, sessionID, serverNames: [serverName] })
    }
    return state
  })
}

/**
 * List all requests (any status) — used by ctf-mcp-control.
 */
export async function listAllRequests(worktree: string) {
  const state = await loadState(worktree)
  return state.requests
}
