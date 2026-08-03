import path from "node:path"
import { randomUUID } from "node:crypto"
import { PLUGIN_ROOT } from "../asset-paths.ts"
import { getAgentDefaults } from "../agent-mcp-profiles.ts"
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
  const serverNames = getAgentDefaults(args.agentName)
  const activated: string[] = []
  const skipped: string[] = []
  const failed: Array<{ serverName: string; message: string }> = []

  const lightMedium: string[] = []
  for (const serverName of serverNames) {
    const meta = lookupMcpServer(serverName)
    if (!meta) {
      skipped.push(`${serverName} (not in registry)`)
      continue
    }
    if (meta.weight === "heavy") {
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
  failed.push(...(result.failed ?? []))
  if (activated.length) {
    await clearMcpActivationIssues({
      worktree: args.worktree,
      sessionID: args.sessionID,
      agentName: args.agentName,
      serverNames: activated,
      phase: "agent_default",
    })
  }
  for (const failure of result.failed ?? []) {
    await recordMcpActivationIssue({
      worktree: args.worktree,
      sessionID: args.sessionID,
      agentName: args.agentName,
      serverName: failure.serverName,
      phase: "agent_default",
      error: failure.message,
    })
  }

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

  return { activated, skipped, failed }
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
    if (!meta) {
      results.push({ serverName, status: `unknown: "${serverName}" not in registry` })
      continue
    }

    const prereq = envPrerequisitesSatisfied(meta)
    if (!prereq.ok) {
      results.push({ serverName, status: `denied: missing env ${prereq.missing.join(", ")}` })
      continue
    }

    const state = await loadState(args.worktree)
    const profile = state.activeProfiles.find((p) => p.agent === args.agentName && p.sessionID === args.sessionID)
    if (profile?.serverNames.includes(serverName)) {
      results.push({ serverName, status: "already_active" })
      continue
    }

    if (
      isInMemoryApproved(serverName, { worktree: args.worktree, sessionID: args.sessionID, agentName: args.agentName })
    ) {
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

    let persistedRequestId = request.id
    await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
      const existing = state.requests.find(
        (candidate) =>
          candidate.agent === args.agentName &&
          candidate.sessionID === args.sessionID &&
          candidate.serverName === serverName &&
          !["denied", "released", "expired"].includes(candidate.status),
      )
      if (existing) {
        persistedRequestId = existing.id
        return state
      }
      state.requests.push(request)
      return state
    })

    requestIds.push(persistedRequestId)
    results.push({ serverName, status: persistedRequestId === request.id ? "pending" : "already_pending" })
  }

  return { requestIds, results }
}

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
      await setRequestStatus(args.worktree, req.id, "denied", { note: "unknown server, not in registry" })
      continue
    }

    const agentCategory = agentNameToCategory(req.agent)
    const categoryMatch = agentCategory && meta.categories.includes(agentCategory)

    if (categoryMatch && meta.weight !== "heavy") {
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
        addInMemoryApproved({
          worktree: args.worktree,
          sessionID: req.sessionID,
          agentName: req.agent,
          serverName: req.serverName,
        })
        autoApproved++
      } else {
        stillPending++
      }
    } else {
      stillPending++
    }
  }

  return { processed: pending.length, autoApproved, stillPending }
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

  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    const req = state.requests.find((r) => r.id === args.requestId)
    if (!req) return state
    if (req.status !== "pending" && req.status !== "approved" && req.status !== "activation_failed") return state
    req.status = "activating"
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

  if (!act.activated.length) {
    await setRequestStatus(args.worktree, args.requestId, "activation_failed", {
      decidedBy: args.decidedBy ?? "ctf-expert",
      note: act.skipped.join("; ") || "activation returned no active servers",
    })
    await recordMcpActivationIssue({
      worktree: args.worktree,
      sessionID,
      agentName: agentName || "unknown",
      serverName,
      phase: "request",
      error: act.skipped.join("; ") || "activation returned no active servers",
    })
    return { ok: false, reason: act.skipped.join("; ") || "activation failed", serverName }
  }

  await setRequestStatus(args.worktree, args.requestId, "active", {
    decidedBy: args.decidedBy ?? "ctf-expert",
    note: args.note,
  })
  await recordActiveServer(args.worktree, agentName || "unknown", sessionID, serverName)
  await clearMcpActivationIssues({
    worktree: args.worktree,
    sessionID,
    agentName: agentName || "unknown",
    serverNames: [serverName],
    phase: "request",
  })

  return { ok: true, serverName, agent: agentName, sessionID, skillName }
}

export async function denyRequest(args: { worktree: string; requestId: string; decidedBy?: string; note?: string }) {
  const result = await setRequestStatus(args.worktree, args.requestId, "denied", {
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
  agentName: string
}) {
  await releaseSkillMcpLeases({
    client: args.client,
    worktree: args.worktree,
    directory: args.directory,
    sessionID: args.sessionID,
  })

  const path = statePath(args.worktree)
  const releasedScopes: Array<{ agentName: string; serverName: string }> = []
  await atomicUpdateJsonFile<AgentMcpState>(path, initialState(), (state) => {
    for (const profile of state.activeProfiles) {
      if (profile.agent !== args.agentName || profile.sessionID !== args.sessionID) continue
      for (const serverName of profile.serverNames) {
        releasedScopes.push({ agentName: profile.agent, serverName })
      }
    }
    state.activeProfiles = state.activeProfiles.filter(
      (profile) => !(profile.agent === args.agentName && profile.sessionID === args.sessionID),
    )
    for (const request of state.requests) {
      if (request.sessionID !== args.sessionID || request.agent !== args.agentName) continue
      if (["approving", "activating", "approved", "active"].includes(request.status)) {
        request.status = "released"
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
  status:
    | "pending"
    | "approving"
    | "activating"
    | "active"
    | "approved"
    | "activation_failed"
    | "denied"
    | "released"
    | "expired",
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
