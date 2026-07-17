import { skillMcpStateFile } from "./paths.ts"
import { atomicUpdateJsonFile, loadJsonFile, nowIso, saveJsonFile } from "./state-store.ts"
import { withFileLock } from "./file-lock.ts"
import type { SkillMcpLease, SkillMcpState } from "./types.ts"
import { bindingForSkillServer, bindingsForSkill, type RuntimeMcpConfig } from "./skill-mcp-registry.ts"
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
  return state.leases.some((item) => item.connected && item.serverName === lease.serverName && !sameLease(item, lease))
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
  await client.mcp.connect({
    path: { name: serverName },
    query: { directory },
  })
}

export async function ensureSkillMcpLeases(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName: string
}) {
  const bindings = bindingsForSkill(args.skillName)
  const path = statePath(args.worktree)

  // Phase 1: Under lock, determine which servers need activation.
  // This prevents TOCTOU with another process that may have just connected
  // the same MCP server for a different session.
  const toActivate = await withFileLock(path, async () => {
    const state = await loadState(args.worktree)
    const result: { serverName: string; config: RuntimeMcpConfig }[] = []

    for (const binding of bindings) {
      const existing = state.leases.find(
        (lease) =>
          lease.sessionID === args.sessionID &&
          lease.skillName === args.skillName &&
          lease.serverName === binding.serverName,
      )
      if (existing?.connected) continue
      if (!state.leases.some((lease) => lease.connected && lease.serverName === binding.serverName)) {
        result.push({ serverName: binding.serverName, config: binding.config })
      }
    }

    return result
  })

  // Phase 2: Connect new servers (outside lock — network I/O should not hold
  // a file lock).  addAndConnect is idempotent: if the server was already added
  // by another process between our Phase 1 read and now, the add fails but the
  // connect still works.
  const activated: string[] = []
  const shared: string[] = []
  for (const { serverName, config } of toActivate) {
    await addAndConnect(args.client, args.directory, serverName, config)
    activated.push(serverName)
  }

  // Phase 3: Under lock again, re-read the state fresh and atomically upsert
  // lease records.  Re-reading inside the lock means we incorporate any
  // connections that another process may have made.
  await atomicUpdateJsonFile<SkillMcpState>(path, initialState(), (state) => {
    for (const binding of bindings) {
      const existing = state.leases.find(
        (lease) =>
          lease.sessionID === args.sessionID &&
          lease.skillName === args.skillName &&
          lease.serverName === binding.serverName,
      )

      if (!existing) {
        const alreadyConnected = state.leases.some(
          (lease) => lease.connected && lease.serverName === binding.serverName,
        )
        if (alreadyConnected && !activated.includes(binding.serverName)) {
          shared.push(binding.serverName)
        }
        const lease: SkillMcpLease = {
          skillName: args.skillName,
          sessionID: args.sessionID,
          serverName: binding.serverName,
          connected: true,
          disconnectWhenIdle: binding.disconnectWhenIdle,
          config: binding.config,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        state.leases.push(lease)
        continue
      }

      existing.disconnectWhenIdle = binding.disconnectWhenIdle
      existing.config = binding.config
      if (!existing.connected) {
        existing.connected = true
        existing.updatedAt = nowIso()
      }
    }
    return state
  })

  return { activated, shared, totalBindings: bindings.length }
}

export async function releaseSkillMcpLeases(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName?: string
}) {
  const path = statePath(args.worktree)

  // Phase 1: Determine what to disconnect (under lock — consistent snapshot)
  const disconnectTargets: { serverName: string }[] = []
  const released: string[] = []
  const retained: string[] = []
  const skipped: string[] = []

  await withFileLock(path, async () => {
    const state = await loadState(args.worktree)

    for (const lease of state.leases) {
      if (lease.sessionID !== args.sessionID) continue
      if (args.skillName && lease.skillName !== args.skillName) continue
      if (!lease.connected) continue

      const binding = bindingForSkillServer(lease.skillName, lease.serverName)
      const disconnectWhenIdle = lease.disconnectWhenIdle ?? binding?.disconnectWhenIdle ?? true
      if (!disconnectWhenIdle) {
        skipped.push(lease.serverName)
        continue
      }

      lease.connected = false
      lease.updatedAt = nowIso()

      if (otherConnectedLease(state, lease)) {
        retained.push(lease.serverName)
        continue
      }

      disconnectTargets.push({ serverName: lease.serverName })
      released.push(lease.serverName)
    }

    await saveJsonFile(path, state)
  })

  // Phase 2: Disconnect MCP servers (outside lock)
  for (const { serverName } of disconnectTargets) {
    await args.client.mcp.disconnect({
      path: { name: serverName },
      query: { directory: args.directory },
    })
  }

  return { released, retained, skipped }
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
  const path = statePath(args.worktree)
  const servers = args.servers.filter((s) => s.serverName && s.config)

  const toActivate = await withFileLock(path, async () => {
    const state = await loadState(args.worktree)
    const result: { serverName: string; config: RuntimeMcpConfig }[] = []
    for (const server of servers) {
      const existing = state.leases.find(
        (lease) =>
          lease.sessionID === args.sessionID &&
          lease.skillName === args.skillName &&
          lease.serverName === server.serverName,
      )
      if (existing?.connected) continue
      if (!state.leases.some((lease) => lease.connected && lease.serverName === server.serverName)) {
        result.push({ serverName: server.serverName, config: server.config })
      }
    }
    return result
  })

  const activated: string[] = []
  const shared: string[] = []
  for (const { serverName, config } of toActivate) {
    await addAndConnect(args.client, args.directory, serverName, config)
    activated.push(serverName)
  }

  await atomicUpdateJsonFile<SkillMcpState>(path, initialState(), (state) => {
    for (const server of servers) {
      const existing = state.leases.find(
        (lease) =>
          lease.sessionID === args.sessionID &&
          lease.skillName === args.skillName &&
          lease.serverName === server.serverName,
      )
      if (!existing) {
        const alreadyConnected = state.leases.some(
          (lease) => lease.connected && lease.serverName === server.serverName,
        )
        if (alreadyConnected && !activated.includes(server.serverName)) {
          shared.push(server.serverName)
        }
        state.leases.push({
          skillName: args.skillName,
          sessionID: args.sessionID,
          serverName: server.serverName,
          connected: true,
          disconnectWhenIdle: server.disconnectWhenIdle ?? true,
          config: server.config as unknown as Record<string, unknown>,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        continue
      }
      existing.disconnectWhenIdle = server.disconnectWhenIdle ?? existing.disconnectWhenIdle
      existing.config = server.config as unknown as Record<string, unknown>
      if (!existing.connected) {
        existing.connected = true
        existing.updatedAt = nowIso()
      }
    }
    return state
  })

  return { activated, shared, totalBindings: servers.length }
}
