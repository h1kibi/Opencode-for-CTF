import { skillMcpStateFile } from "./paths.ts"
import { atomicUpdateJsonFile, loadJsonFile, nowIso, saveJsonFile } from "./state-store.ts"
import { withFileLock } from "./file-lock.ts"
import { randomUUID } from "node:crypto"
import type { SkillMcpLease, SkillMcpLeaseStatus, SkillMcpState } from "./types.ts"
import {
  bindingForSkillServer,
  bindingsForSkill,
  type RuntimeMcpConfig,
  type SkillMcpBinding,
} from "./skill-mcp-registry.ts"
import type { OpencodeClient } from "@opencode-ai/sdk"

function initialState(): SkillMcpState {
  return {
    version: 1,
    leases: [],
    updatedAt: nowIso(),
  }
}

function statePath(worktree: string) {
  return skillMcpStateFile(worktree)
}

async function loadState(worktree: string) {
  return loadJsonFile<SkillMcpState>(statePath(worktree), initialState())
}

/** @visibleForTesting */
export function toSdkConfig(config: RuntimeMcpConfig) {
  if (config.type === "local") {
    if (!config.command) {
      console.warn("[skill-mcp] toSdkConfig: local MCP config has no command; defaulting to empty array")
    }
    return {
      type: "local" as const,
      command: config.command ?? [],
      environment: config.environment ?? {},
      timeout: config.timeout,
    }
  }

  if (!config.url) {
    console.warn("[skill-mcp] toSdkConfig: remote MCP config has no url; defaulting to empty string")
  }
  return {
    type: "remote" as const,
    url: config.url ?? "",
    headers: config.headers ?? {},
    timeout: config.timeout,
  }
}

/** @visibleForTesting */
export function sameLease(a: SkillMcpLease, b: Pick<SkillMcpLease, "sessionID" | "skillName" | "serverName">) {
  return a.sessionID === b.sessionID && a.skillName === b.skillName && a.serverName === b.serverName
}

/** @visibleForTesting */
export function otherConnectedLease(
  state: SkillMcpState,
  lease: Pick<SkillMcpLease, "sessionID" | "skillName" | "serverName">,
) {
  return state.leases.some(
    (item) => leaseIsConnected(item) && item.serverName === lease.serverName && !sameLease(item, lease),
  )
}

// ---------------------------------------------------------------------------
// Lease lifecycle helpers
// ---------------------------------------------------------------------------

/** A lease counts as connected when status says so (legacy: the boolean). */
export function leaseIsConnected(lease: SkillMcpLease): boolean {
  if (lease.status) return lease.status === "connected"
  return lease.connected
}

/** Stale window before a `connecting` lease may be taken over (owner crashed). */
const CONNECTING_STALE_MS = 15_000

function isFreshConnecting(lease: SkillMcpLease): boolean {
  if (lease.status !== "connecting") return false
  if (!lease.transitionAt) return true
  const age = Date.now() - Date.parse(lease.transitionAt)
  return Number.isFinite(age) && age < CONNECTING_STALE_MS
}

/** Mutate a lease's lifecycle status and keep the legacy boolean in sync. */
export function setLeaseStatus(lease: SkillMcpLease, status: SkillMcpLeaseStatus, ownerToken?: string): void {
  lease.status = status
  lease.connected = status === "connected"
  lease.transitionAt = nowIso()
  if (ownerToken !== undefined) lease.ownerToken = ownerToken
  lease.updatedAt = nowIso()
}

function makeLease(
  args: { sessionID: string; skillName: string; serverName: string; config: unknown; disconnectWhenIdle: boolean },
  status: SkillMcpLeaseStatus,
  ownerToken?: string,
): SkillMcpLease {
  const ts = nowIso()
  const lease: SkillMcpLease = {
    skillName: args.skillName,
    sessionID: args.sessionID,
    serverName: args.serverName,
    connected: status === "connected",
    disconnectWhenIdle: args.disconnectWhenIdle,
    config: args.config as Record<string, unknown>,
    createdAt: ts,
    updatedAt: ts,
  }
  setLeaseStatus(lease, status, ownerToken)
  return lease
}

type LeaseClaimArgs = {
  sessionID: string
  skillName: string
  serverName: string
  config: RuntimeMcpConfig
  disconnectWhenIdle: boolean
}

type LeaseClaim =
  | { claim: "connected"; serverName: string }
  | { claim: "shared"; serverName: string }
  | { claim: "pending"; serverName: string }
  | { claim: "activated"; serverName: string }

/**
 * Claim or attach to a named server lease with a proper lifecycle:
 *
 * - state transitions are persisted UNDER the file lock, so two concurrent
 *   callers can never both decide "not connected yet, activate";
 * - the external connect runs OUTSIDE the lock, but only the holder of a
 *   `connecting` lease (matching ownerToken) may finalize it;
 * - a crashed holder leaves a stale `connecting` lease which is taken over
 *   after CONNECTING_STALE_MS;
 * - a failed connect removes the claim instead of leaving ghost state.
 */
async function claimServerLease(
  client: OpencodeClient,
  worktree: string,
  directory: string,
  args: LeaseClaimArgs,
): Promise<LeaseClaim> {
  const path = statePath(worktree)
  const ownerToken = randomUUID().slice(0, 8)

  // Phase 1 — decide + persist the transition (single lock, no nesting).
  const decision = await withFileLock(path, async () => {
    const state = await loadState(worktree)
    const own = state.leases.find((lease) => sameLease(lease, args))
    if (own && leaseIsConnected(own)) return "connected" as const

    const otherActive = state.leases.some(
      (lease) => lease.serverName === args.serverName && !sameLease(lease, args) && leaseIsConnected(lease),
    )
    if (otherActive) {
      // Another session owns the server: attach as shared (no external connect).
      if (own) setLeaseStatus(own, "connected")
      else state.leases.push(makeLease(args, "connected"))
      await saveJsonFile(path, state)
      return "shared" as const
    }

    const otherConnecting = state.leases.some(
      (lease) => lease.serverName === args.serverName && !sameLease(lease, args) && isFreshConnecting(lease),
    )
    if (otherConnecting) {
      // Someone else is mid-connect: record ours as pending; the next ensure
      // call resolves it (self-healing if that connect fails).
      if (own) setLeaseStatus(own, "pending")
      else state.leases.push(makeLease(args, "pending"))
      await saveJsonFile(path, state)
      return "pending" as const
    }

    // Nobody active: claim the server. Take over any stale connecting lease.
    for (const lease of state.leases) {
      if (lease.serverName === args.serverName && !sameLease(lease, args) && lease.status === "connecting") {
        setLeaseStatus(lease, "unknown")
      }
    }
    if (own) setLeaseStatus(own, "connecting", ownerToken)
    else state.leases.push(makeLease(args, "connecting", ownerToken))
    await saveJsonFile(path, state)
    return "activate" as const
  })

  if (decision !== "activate") {
    return { claim: decision, serverName: args.serverName }
  }

  // Phase 2 — external connect OUTSIDE the lock.
  try {
    await addAndConnect(client, directory, args.serverName, args.config)
  } catch (error) {
    // Roll the claim back (remove it) so a retry starts clean.
    await atomicUpdateJsonFile<SkillMcpState>(path, initialState(), (state) => {
      state.leases = state.leases.filter(
        (lease) => !(sameLease(lease, args) && lease.status === "connecting" && lease.ownerToken === ownerToken),
      )
      return state
    })
    throw error
  }

  // Phase 3 — finalize: only the claim holder may flip connecting -> connected.
  await atomicUpdateJsonFile<SkillMcpState>(path, initialState(), (state) => {
    const own = state.leases.find((lease) => sameLease(lease, args))
    if (own && own.status === "connecting" && own.ownerToken === ownerToken) {
      setLeaseStatus(own, "connected")
    }
    return state
  })
  return { claim: "activated", serverName: args.serverName }
}

function mcpDisplayName(serverName: string): string {
  if (serverName === "context7" || serverName === "runtime_context7_java") return "Context7"
  if (serverName === "anysearch" || serverName === "runtime_anysearch_remote") return "AnySearch"
  return serverName
}

export function describeMcpActivationError(serverName: string, error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error)
  const text = raw.toLowerCase()
  const name = mcpDisplayName(serverName)

  if (
    (serverName === "context7" || serverName === "runtime_context7_java") &&
    /(429|too many requests|rate limit|rate-limit|quota|resource exhausted|usage limit)/.test(text)
  ) {
    return {
      code: "context7_rate_limited",
      message:
        "Context7 is currently rate-limited or quota-exhausted. Continue with local RAG/GitHub/manual analysis, or retry Context7 later.",
    }
  }

  if (
    (serverName === "anysearch" || serverName === "runtime_anysearch_remote") &&
    /(429|too many requests|rate limit|rate-limit|quota|resource exhausted|usage limit)/.test(text)
  ) {
    return {
      code: "anysearch_rate_limited",
      message:
        "AnySearch is currently rate-limited or quota-exhausted. Retry later or configure a valid ANYSEARCH_API_KEY for a higher quota path.",
    }
  }

  if (/(401|403|unauthorized|forbidden|invalid api key|invalid token|authentication)/.test(text)) {
    return {
      code: "remote_auth_failed",
      message: `${name} authentication failed. Check required tokens/headers and retry.`,
    }
  }

  if (/(timeout|timed out|fetch failed|econnrefused|econnreset|enotfound|network|socket hang up)/.test(text)) {
    return {
      code: "remote_unreachable",
      message: `${name} is currently unreachable from this runtime. Retry later or continue without that MCP.`,
    }
  }

  return {
    code: "activation_failed",
    message: `${name} activation failed: ${raw}`,
  }
}

async function addAndConnect(client: OpencodeClient, directory: string, serverName: string, config: RuntimeMcpConfig) {
  try {
    await client.mcp.add({
      body: {
        name: serverName,
        config: toSdkConfig(config),
      },
      query: { directory },
    })
  } catch (err) {
    // Server may already exist globally or from another session lease; connect below.
    console.warn(`[skill-mcp] add server "${serverName}" failed (may already exist):`, err)
  }
  try {
    await client.mcp.connect({
      path: { name: serverName },
      query: { directory },
    })
  } catch (error) {
    const described = describeMcpActivationError(serverName, error)
    throw new Error(described.message)
  }
}

async function ensureSkillBindingLease(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName: string
  binding: SkillMcpBinding
}) {
  const result = await claimServerLease(args.client, args.worktree, args.directory, {
    sessionID: args.sessionID,
    skillName: args.skillName,
    serverName: args.binding.serverName,
    config: args.binding.config,
    disconnectWhenIdle: args.binding.disconnectWhenIdle ?? true,
  })
  return {
    activated: result.claim === "activated" ? [result.serverName] : [],
    shared: result.claim === "shared" || result.claim === "pending" ? [result.serverName] : [],
    failed: [] as never[],
  }
}

export async function ensureSkillMcpLeases(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName: string
}) {
  const bindings = bindingsForSkill(args.skillName)
  const activated: string[] = []
  const shared: string[] = []
  const failed: Array<{ serverName: string; message: string }> = []

  for (const binding of bindings) {
    try {
      const result = await ensureSkillBindingLease({
        client: args.client,
        worktree: args.worktree,
        directory: args.directory,
        sessionID: args.sessionID,
        skillName: args.skillName,
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

  return { activated, shared, failed, totalBindings: bindings.length }
}

export async function releaseSkillMcpLeases(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName?: string
}) {
  const path = statePath(args.worktree)
  const disconnectTargets: { serverName: string; ownerToken: string }[] = []
  const released: string[] = []
  const retained: string[] = []
  const skipped: string[] = []
  const disconnectFailed: string[] = []

  // Phase 1: decide what to disconnect and persist `disconnecting` (under lock).
  await withFileLock(path, async () => {
    const state = await loadState(args.worktree)

    for (const lease of state.leases) {
      if (lease.sessionID !== args.sessionID) continue
      if (args.skillName && lease.skillName !== args.skillName) continue
      if (!leaseIsConnected(lease)) continue

      const binding = bindingForSkillServer(lease.skillName, lease.serverName)
      const disconnectWhenIdle = lease.disconnectWhenIdle ?? binding?.disconnectWhenIdle ?? true
      if (!disconnectWhenIdle) {
        skipped.push(lease.serverName)
        continue
      }

      if (otherConnectedLease(state, lease)) {
        // Shared server: drop only our reference; the connection stays alive.
        setLeaseStatus(lease, "pending")
        retained.push(lease.serverName)
        continue
      }

      const ownerToken = randomUUID().slice(0, 8)
      setLeaseStatus(lease, "disconnecting", ownerToken)
      disconnectTargets.push({ serverName: lease.serverName, ownerToken })
      released.push(lease.serverName)
    }

    await saveJsonFile(path, state)
  })

  // Phase 2: disconnect MCP servers (outside lock) with compensation.
  for (const { serverName, ownerToken } of disconnectTargets) {
    try {
      await args.client.mcp.disconnect({
        path: { name: serverName },
        query: { directory: args.directory },
      })
    } catch (error) {
      disconnectFailed.push(serverName)
      console.warn(
        `[skill-mcp] disconnect of "${serverName}" failed; reverting lease to connected for compensation:`,
        error instanceof Error ? error.message : String(error),
      )
      // The connection may still be live — never leave state claiming
      // "disconnected" while the server might still be connected.
      await atomicUpdateJsonFile<SkillMcpState>(path, initialState(), (state) => {
        const lease = state.leases.find(
          (item) =>
            item.sessionID === args.sessionID &&
            item.serverName === serverName &&
            item.status === "disconnecting" &&
            item.ownerToken === ownerToken,
        )
        if (lease) setLeaseStatus(lease, "connected")
        return state
      })
      continue
    }
    await atomicUpdateJsonFile<SkillMcpState>(path, initialState(), (state) => {
      const lease = state.leases.find(
        (item) =>
          item.sessionID === args.sessionID &&
          item.serverName === serverName &&
          item.status === "disconnecting" &&
          item.ownerToken === ownerToken,
      )
      if (lease) setLeaseStatus(lease, "pending")
      return state
    })
  }

  return { released, retained, skipped, disconnectFailed }
}

export async function listSkillMcpLeases(worktree: string) {
  return loadState(worktree)
}

/**
 * Activate explicit MCP servers (by name + config) under a synthetic skill lease key.
 * Used by agent default profiles and dynamic MCP approve/request paths, which are
 * not bound through SKILL_MCP_BINDINGS.
 */
export async function ensureNamedServerLeases(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  /** Synthetic skill key used for lease accounting, e.g. agent-default:ctf-web */
  skillName: string
  servers: Array<{ serverName: string; config: RuntimeMcpConfig; disconnectWhenIdle?: boolean }>
}) {
  const servers = args.servers.filter((s) => s.serverName && s.config)
  const activated: string[] = []
  const shared: string[] = []
  const failed: Array<{ serverName: string; message: string }> = []

  for (const server of servers) {
    try {
      const result = await claimServerLease(args.client, args.worktree, args.directory, {
        sessionID: args.sessionID,
        skillName: args.skillName,
        serverName: server.serverName,
        config: server.config,
        disconnectWhenIdle: server.disconnectWhenIdle ?? true,
      })
      if (result.claim === "activated") activated.push(result.serverName)
      else if (result.claim === "shared" || result.claim === "pending") shared.push(result.serverName)
    } catch (error) {
      failed.push({
        serverName: server.serverName,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { activated, shared, failed, totalBindings: servers.length }
}
