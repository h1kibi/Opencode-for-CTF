import path from "node:path"
import { randomUUID } from "node:crypto"
import { PLUGIN_ROOT } from "../asset-paths.ts"
import { probeSessionPresence } from "../team/session-liveness.ts"
import { findJobBySession, isTerminalJob, readTeamState } from "../team/team-state.ts"
import { lookupMcpServer, envPrerequisitesSatisfied } from "../mcp-server-registry.ts"
import { agentMcpStateFile } from "../paths.ts"
import { describeMcpActivationError, ensureNamedServerLeases, releaseSkillMcpLeases } from "../skill-mcp-manager.ts"
import type { RuntimeMcpConfig } from "../skill-mcp-registry.ts"
import { atomicUpdateJsonFile, loadJsonFile, nowIso } from "../state-store.ts"
import type { AgentMcpActivationIssue, AgentMcpRequest, AgentMcpState, McpServerMeta } from "../types.ts"
import type { OpencodeClient } from "@opencode-ai/sdk"

export type AgentCategory = "web" | "pwn" | "rev" | "crypto" | "forensics" | "misc" | undefined

export function expandPlaceholder(value: string): string {
  return value
    .replaceAll("{plugin_root}", PLUGIN_ROOT)
    .replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "")
}

export function expandRecord(input?: Record<string, string>): Record<string, string> | undefined {
  if (!input) return undefined
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, expandPlaceholder(value)]))
}

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

function initialState(): AgentMcpState {
  return {
    version: 1,
    activeProfiles: [],
    requests: [],
    activationIssues: [],
    updatedAt: nowIso(),
  }
}

function statePath(worktree: string) {
  return agentMcpStateFile(worktree)
}

async function loadState(worktree: string) {
  return loadJsonFile<AgentMcpState>(statePath(worktree), initialState())
}
function activationStateForStatus(status: AgentMcpRequest["status"]): NonNullable<AgentMcpRequest["activationState"]> {
  if (status === "activating") return "activating"
  if (status === "active" || status === "approved") return "active"
  if (status === "released") return "released"
  if (status === "expired" || status === "denied" || status === "activation_failed") return "failed"
  return "idle"
}

async function teamOwnerEligibility(directory: string, sessionID: string): Promise<"eligible" | "terminal" | "unknown"> {
  try {
    const state = await readTeamState(directory)
    const located = findJobBySession(state, sessionID)
    if (!located) return "eligible"
    if (isTerminalJob(located.job.status) || located.job.retryPending || located.job.retrySessionID || ["completed", "cancelled", "cancelling"].includes(located.run.status)) return "terminal"
    return "eligible"
  } catch {
    return "unknown"
  }
}

function nextIssueId() {
  return `mcp-issue-${randomUUID().slice(0, 8)}`
}

function approvalKey(args: { worktree: string; sessionID: string; agentName: string; serverName: string }) {
  return [path.resolve(args.worktree), args.sessionID, args.agentName, args.serverName].join("|")
}

const IN_MEMORY_APPROVED = new Map<string, number>()
const IN_MEMORY_TTL_MS = 30 * 60_000
const IN_MEMORY_MAX = 50

export function isInMemoryApproved(
  serverName: string,
  scope?: { worktree: string; sessionID: string; agentName: string },
): boolean {
  const key = scope ? approvalKey({ ...scope, serverName }) : serverName
  const ts = IN_MEMORY_APPROVED.get(key)
  if (ts === undefined) return false
  if (Date.now() - ts > IN_MEMORY_TTL_MS) {
    IN_MEMORY_APPROVED.delete(key)
    return false
  }
  return true
}

function addInMemoryApproved(scope: {
  worktree: string
  sessionID: string
  agentName: string
  serverName: string
}): void {
  if (IN_MEMORY_APPROVED.size >= IN_MEMORY_MAX) {
    const oldest = [...IN_MEMORY_APPROVED.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) IN_MEMORY_APPROVED.delete(oldest[0])
  }
  const key = approvalKey(scope)
  IN_MEMORY_APPROVED.set(key, Date.now())
}

function removeInMemoryApproved(scope: {
  worktree: string
  sessionID: string
  agentName: string
  serverName: string
}): void {
  IN_MEMORY_APPROVED.delete(approvalKey(scope))
}

export function pruneInMemoryApproved(): void {
  const now = Date.now()
  for (const [key, ts] of IN_MEMORY_APPROVED) {
    if (now - ts > IN_MEMORY_TTL_MS) IN_MEMORY_APPROVED.delete(key)
  }
}

export function agentNameToCategory(agent: string): AgentCategory {
  const map: Record<string, AgentCategory> = {
    "ctf-web": "web",
    "ctf-pwn": "pwn",
    "ctf-rev": "rev",
    "ctf-crypto": "crypto",
    "ctf-forensics": "forensics",
    "ctf-misc": "misc",
    "ctf-aisec": "misc",
  }
  return map[agent]
}

function activateRegistryServers(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName: string
  serverNames: string[]
}): Promise<{ activated: string[]; skipped: string[]; failed: Array<{ serverName: string; message: string }> }> {
  return (async () => {
    const activated: string[] = []
    const skipped: string[] = []
    const failed: Array<{ serverName: string; message: string }> = []
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

    for (const server of servers) {
      try {
        const result = await ensureNamedServerLeases({
          client: args.client,
          worktree: args.worktree,
          directory: args.directory,
          sessionID: args.sessionID,
          skillName: args.skillName,
          servers: [server],
        })
        activated.push(...result.activated, ...result.shared)
      } catch (error) {
        const described = describeMcpActivationError(server.serverName, error)
        skipped.push(`${server.serverName} (${described.message})`)
        failed.push({ serverName: server.serverName, message: described.message })
      }
    }

    return { activated: [...new Set(activated)], skipped, failed }
  })()
}

export async function recordMcpActivationIssue(args: {
  worktree: string
  sessionID: string
  agentName: string
  serverName: string
  phase: AgentMcpActivationIssue["phase"]
  error: unknown
}) {
  const described = describeMcpActivationError(args.serverName, args.error)
  const timestamp = nowIso()
  await atomicUpdateJsonFile<AgentMcpState>(statePath(args.worktree), initialState(), (state) => {
    const issues = state.activationIssues ?? (state.activationIssues = [])
    const existing = issues.find(
      (issue) =>
        issue.sessionID === args.sessionID &&
        issue.agent === args.agentName &&
        issue.serverName === args.serverName &&
        issue.phase === args.phase &&
        issue.code === described.code,
    )
    if (existing) {
      existing.message = described.message
      existing.updatedAt = timestamp
    } else {
      issues.push({
        id: nextIssueId(),
        agent: args.agentName,
        sessionID: args.sessionID,
        serverName: args.serverName,
        phase: args.phase,
        code: described.code,
        message: described.message,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    state.activationIssues = issues.slice(-20)
    return state
  })
  return described
}

export async function clearMcpActivationIssues(args: {
  worktree: string
  sessionID: string
  agentName?: string
  serverNames?: string[]
  phase?: AgentMcpActivationIssue["phase"]
}) {
  await atomicUpdateJsonFile<AgentMcpState>(statePath(args.worktree), initialState(), (state) => {
    const issues = state.activationIssues ?? []
    state.activationIssues = issues.filter((issue) => {
      if (issue.sessionID !== args.sessionID) return true
      if (args.agentName && issue.agent !== args.agentName) return true
      if (args.phase && issue.phase !== args.phase) return true
      if (args.serverNames?.length && !args.serverNames.includes(issue.serverName)) return true
      return false
    })
    return state
  })
}

export async function listRecentActivationIssues(
  worktree: string,
  filter?: { sessionID?: string; agentName?: string },
): Promise<AgentMcpActivationIssue[]> {
  const state = await loadState(worktree)
  return (state.activationIssues ?? [])
    .filter((issue) => {
      if (filter?.sessionID && issue.sessionID !== filter.sessionID) return false
      if (filter?.agentName && issue.agent !== filter.agentName) return false
      return true
    })
    .slice(-10)
}

export async function activateAgentDefaults(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  agentName: string
}) {
  const { activateAgentProfile } = await import("./mcp-activation-coordinator.ts")
  const result = await activateAgentProfile(args)
  // Merge activated and shared for backward compatibility
  return {
    activated: [...result.activated, ...result.shared],
    skipped: result.skipped,
    failed: result.failed,
  }
}


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
    if (!meta) { results.push({ serverName, status: `unknown: "${serverName}" not in registry` }); continue }
    const prereq = envPrerequisitesSatisfied(meta)
    if (!prereq.ok) { results.push({ serverName, status: `denied: missing env ${prereq.missing.join(", ")}` }); continue }
    const state = await loadState(args.worktree)
    const profile = state.activeProfiles.find((profile) => profile.agent === args.agentName && profile.sessionID === args.sessionID)
    if (profile?.serverNames.includes(serverName)) { results.push({ serverName, status: "already_active" }); continue }
    if (isInMemoryApproved(serverName, { worktree: args.worktree, sessionID: args.sessionID, agentName: args.agentName })) { results.push({ serverName, status: "approved (in-memory)" }); continue }
    const timestamp = nowIso()
    const request: AgentMcpRequest = {
      id: `mcp-req-${randomUUID().slice(0, 8)}`,
      agent: args.agentName,
      sessionID: args.sessionID,
      serverName,
      reason: args.reason,
      status: "pending",
      createdAt: timestamp,
      expiresAt: new Date(Date.parse(timestamp) + IN_MEMORY_TTL_MS).toISOString(),
      updatedAt: timestamp,
    }
    let persistedRequestId = request.id
    await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (current) => {
      const existing = current.requests.find((candidate) => candidate.agent === args.agentName && candidate.sessionID === args.sessionID && candidate.serverName === serverName && !["denied", "released", "expired"].includes(candidate.status))
      if (existing) persistedRequestId = existing.id
      else current.requests.push(request)
      return current
    })
    requestIds.push(persistedRequestId)
    results.push({ serverName, status: persistedRequestId === request.id ? "pending" : "already_pending" })
  }
  return { requestIds, results }
}


export async function processPendingRequests(args: { client: OpencodeClient; worktree: string; directory: string; sessionID?: string }) {
  const state = await loadState(args.worktree)
  const pending = state.requests.filter((request) => request.status === "pending" && (!args.sessionID || request.sessionID === args.sessionID))
  if (!pending.length) return { processed: 0, autoApproved: 0, stillPending: 0, expired: 0, skippedNotLive: 0 }
  const nowMs = Date.now()
  const requestTtlMs = 30 * 60_000
  let autoApproved = 0
  let stillPending = 0
  let expired = 0
  let skippedNotLive = 0

  for (const request of pending) {
    const expiresAt = request.expiresAt ? Date.parse(request.expiresAt) : Date.parse(request.createdAt) + requestTtlMs
    if (!Number.isFinite(expiresAt) || nowMs >= expiresAt) {
      if (await setRequestStatus(args.worktree, request.id, "expired", { expected: "pending", note: "MCP request expired before activation." })) expired++
      continue
    }
    const presence = await probeSessionPresence(args.client, args.directory, request.sessionID)
    if (presence !== "present") {
      if (presence === "absent") {
        if (await setRequestStatus(args.worktree, request.id, "expired", { expected: "pending", note: "MCP request owner session is no longer live." })) skippedNotLive++
      } else {
        stillPending++
      }
      continue
    }
    const owner = await teamOwnerEligibility(args.directory, request.sessionID)
    if (owner === "terminal") {
      await setRequestStatus(args.worktree, request.id, "released", { expected: "pending", note: "MCP request owner Team job is terminal." })
      skippedNotLive++
      continue
    }
    if (owner === "unknown") {
      stillPending++
      continue
    }
    const meta = lookupMcpServer(request.serverName)
    if (!meta) {
      await setRequestStatus(args.worktree, request.id, "denied", { expected: "pending", note: "unknown server, not in registry" })
      continue
    }
    const agentCategory = agentNameToCategory(request.agent)
    if (!(agentCategory && meta.categories.includes(agentCategory) && meta.weight !== "heavy")) {
      stillPending++
      continue
    }
    const activationToken = await claimPendingRequest(args.worktree, request.id)
    if (!activationToken) continue
    const skillName = `agent-request:${request.agent}`
    const act = await activateRegistryServers({ client: args.client, worktree: args.worktree, directory: args.directory, sessionID: request.sessionID, skillName, serverNames: [request.serverName] })
    if (act.activated.length) {
      const committed = await commitActiveServer(args.worktree, request.id, activationToken, request.agent, request.sessionID, request.serverName, {
        decidedBy: "auto",
        note: "auto-approved",
      })
      if (!committed) {
        await releaseSkillMcpLeases({ client: args.client, worktree: args.worktree, directory: args.directory, sessionID: request.sessionID, skillName })
        continue
      }
      addInMemoryApproved({ worktree: args.worktree, sessionID: request.sessionID, agentName: request.agent, serverName: request.serverName })
      autoApproved++
    } else {
      await finalizeRequest(args.worktree, request.id, activationToken, "activation_failed", act.skipped.join("; ") || "activation returned no active servers")
      stillPending++
    }
  }
  return { processed: pending.length, autoApproved, stillPending, expired, skippedNotLive }
}

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
  let activationToken: string | undefined
  let expired = false

  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    const request = state.requests.find((candidate) => candidate.id === args.requestId)
    if (!request || !["pending", "activation_failed"].includes(request.status) || request.activationToken) return state
    const expiresAt = request.expiresAt ? Date.parse(request.expiresAt) : Date.parse(request.createdAt) + IN_MEMORY_TTL_MS
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      request.status = "expired"
      request.activationState = activationStateForStatus("expired")
      request.activationToken = undefined
      request.decidedBy = args.decidedBy ?? "ctf-expert"
      request.decidedNote = "MCP request expired before approval."
      request.updatedAt = nowIso()
      expired = true
      return state
    }
    activationToken = randomUUID()
    request.status = "activating"
    request.activationState = activationStateForStatus("activating")
    request.activationToken = activationToken
    request.decidedBy = args.decidedBy ?? "ctf-expert"
    if (args.note) request.decidedNote = args.note
    request.updatedAt = nowIso()
    serverName = request.serverName
    sessionID = request.sessionID
    agentName = request.agent
    return state
  })

  if (expired) return { ok: false, reason: "request expired" }
  if (!activationToken || !serverName || !sessionID) return { ok: false, reason: "request not found or already activating" }
  const presence = await probeSessionPresence(args.client, args.directory, sessionID)
  if (presence !== "present") {
    await finalizeRequest(
      args.worktree,
      args.requestId,
      activationToken,
      presence === "absent" ? "expired" : "pending",
      presence === "absent" ? "MCP request owner session is no longer live." : "MCP request owner session liveness is unknown; retry later.",
    )
    return { ok: false, reason: presence === "absent" ? "owner session is no longer live" : "owner session liveness is unknown" }
  }
  const owner = await teamOwnerEligibility(args.directory, sessionID)
  if (owner !== "eligible") {
    await finalizeRequest(
      args.worktree,
      args.requestId,
      activationToken,
      owner === "terminal" ? "released" : "pending",
      owner === "terminal" ? "MCP request owner Team job is terminal." : "Team owner state is unavailable; retry later.",
    )
    return { ok: false, reason: owner === "terminal" ? "owner Team job is terminal" : "owner Team state is unknown" }
  }

  const { activateRegistryServers } = await import("./mcp-activation-coordinator.ts")
  const act = await activateRegistryServers({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID,
    agentName: agentName || "unknown",
    serverNames: [serverName],
  })
  if (!act.activated.length) {
    await finalizeRequest(args.worktree, args.requestId, activationToken, "activation_failed", act.skipped.join("; ") || "activation returned no active servers")
    await recordMcpActivationIssue({ worktree: args.worktree, sessionID, agentName: agentName || "unknown", serverName, phase: "request", error: act.skipped.join("; ") || "activation returned no active servers" })
    return { ok: false, reason: act.skipped.join("; ") || "activation failed", serverName }
  }
  const committed = await commitActiveServer(args.worktree, args.requestId, activationToken, agentName || "unknown", sessionID, serverName, {
    decidedBy: args.decidedBy ?? "ctf-expert",
    note: args.note,
  })
  if (!committed) {
    const { releaseMcps } = await import("./mcp-activation-coordinator.ts")
    const skillName = `agent-request:${agentName || "unknown"}`
    await releaseMcps({ client: args.client, worktree: args.worktree, directory: args.directory, sessionID, skillName })
    return { ok: false, reason: "request was released while activation was in flight", serverName }
  }
  addInMemoryApproved({ worktree: args.worktree, sessionID, agentName: agentName || "unknown", serverName })
  await clearMcpActivationIssues({ worktree: args.worktree, sessionID, agentName: agentName || "unknown", serverNames: [serverName], phase: "request" })
  return { ok: true, serverName, agent: agentName, sessionID, skillName: `agent-request:${agentName || "unknown"}` }
}

export async function denyRequest(args: { worktree: string; requestId: string; decidedBy?: string; note?: string }) {
  const result = await setRequestStatus(args.worktree, args.requestId, "denied", {
    expected: ["pending", "activation_failed"],
    decidedBy: args.decidedBy,
    note: args.note,
  })
  return { ok: result, requestId: args.requestId }
}

export async function releaseSessionMcps(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  agentName?: string
}) {
  const { releaseAllSessionMcps } = await import("./mcp-activation-coordinator.ts")
  await releaseAllSessionMcps({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID: args.sessionID,
  })

  const path = statePath(args.worktree)
  const releasedScopes: Array<{ agentName: string; serverName: string }> = []
  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    for (const profile of state.activeProfiles) {
      if (profile.sessionID !== args.sessionID) continue
      for (const serverName of profile.serverNames) releasedScopes.push({ agentName: profile.agent, serverName })
    }
    state.activeProfiles = state.activeProfiles.filter((profile) => profile.sessionID !== args.sessionID)
    for (const request of state.requests) {
      if (request.sessionID !== args.sessionID) continue
      if (["pending", "approving", "activating", "approved", "active"].includes(request.status)) {
        request.status = "released"
        request.activationState = activationStateForStatus("released")
        request.activationToken = undefined
        request.decidedNote = "Owner session ended before MCP activation completed."
        request.updatedAt = nowIso()
      }
    }
    return state
  })
  for (const scope of releasedScopes) {
    removeInMemoryApproved({
      worktree: args.worktree,
      sessionID: args.sessionID,
      agentName: scope.agentName,
      serverName: scope.serverName,
    })
  }

}

export async function listPendingRequests(worktree: string) {
  const state = await loadState(worktree)
  return state.requests.filter((r) => r.status === "pending")
}

export async function getAgentMcpState(worktree: string) {
  return loadState(worktree)
}

export async function listAllRequests(worktree: string) {
  const state = await loadState(worktree)
  return state.requests
}

async function setRequestStatus(
  worktree: string,
  requestId: string,
  status: AgentMcpRequest["status"],
  opts?: { expected?: AgentMcpRequest["status"] | AgentMcpRequest["status"][]; decidedBy?: string; note?: string },
): Promise<boolean> {
  let changed = false
  await atomicUpdateJsonFile<AgentMcpState>(statePath(worktree), initialState(), (state) => {
    const request = state.requests.find((candidate) => candidate.id === requestId)
    const expected = opts?.expected
    const allowed = expected ? (Array.isArray(expected) ? expected : [expected]) : undefined
    if (!request || (allowed && !allowed.includes(request.status))) return state
    request.status = status
    request.activationState = activationStateForStatus(status)
    request.activationToken = undefined
    if (opts?.decidedBy !== undefined) request.decidedBy = opts.decidedBy
    if (opts?.note !== undefined) request.decidedNote = opts.note
    request.updatedAt = nowIso()
    changed = true
    return state
  })
  return changed
}

async function claimPendingRequest(worktree: string, requestId: string): Promise<string | undefined> {
  let token: string | undefined
  await atomicUpdateJsonFile<AgentMcpState>(statePath(worktree), initialState(), (state) => {
    const request = state.requests.find((candidate) => candidate.id === requestId)
    if (!request || request.status !== "pending") return state
    token = randomUUID()
    request.status = "activating"
    request.activationState = activationStateForStatus("activating")
    request.activationToken = token
    request.updatedAt = nowIso()
    return state
  })
  return token
}

async function finalizeRequest(
  worktree: string,
  requestId: string,
  token: string,
  status: AgentMcpRequest["status"],
  note?: string,
): Promise<boolean> {
  let finalized = false
  await atomicUpdateJsonFile<AgentMcpState>(statePath(worktree), initialState(), (state) => {
    const request = state.requests.find((candidate) => candidate.id === requestId)
    if (!request || request.status !== "activating" || request.activationToken !== token) return state
    if (status === "active" || status === "approved") return state
    request.status = status
    request.activationState = activationStateForStatus(status)
    request.activationToken = undefined
    if (note !== undefined) request.decidedNote = note
    request.updatedAt = nowIso()
    finalized = true
    return state
  })
  return finalized
}

async function commitActiveServer(
  worktree: string,
  requestId: string,
  token: string,
  agent: string,
  sessionID: string,
  serverName: string,
  decision?: { decidedBy?: string; note?: string },
): Promise<boolean> {
  let committed = false
  await atomicUpdateJsonFile<AgentMcpState>(statePath(worktree), initialState(), (state) => {
    const request = state.requests.find((candidate) => candidate.id === requestId)
    if (!request || request.status !== "activating" || request.activationToken !== token) return state
    request.status = "active"
    request.activationState = activationStateForStatus("active")
    request.activationToken = undefined
    if (decision?.decidedBy !== undefined) request.decidedBy = decision.decidedBy
    if (decision?.note !== undefined) request.decidedNote = decision.note
    request.updatedAt = nowIso()
    const existing = state.activeProfiles.find((profile) => profile.agent === agent && profile.sessionID === sessionID)
    if (existing) existing.serverNames = [...new Set([...existing.serverNames, serverName])]
    else state.activeProfiles.push({ agent, sessionID, serverNames: [serverName] })
    committed = true
    return state
  })
  return committed
}

