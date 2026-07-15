import { skillMcpStateFile } from "./paths.ts"
import { loadJsonFile, nowIso, saveJsonFile } from "./state-store.ts"
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

async function loadState(worktree: string) {
  return loadJsonFile<SkillMcpState>(skillMcpStateFile(worktree), initialState())
}

async function saveState(worktree: string, state: SkillMcpState) {
  state.updatedAt = nowIso()
  await saveJsonFile(skillMcpStateFile(worktree), state)
}

function toSdkConfig(config: RuntimeMcpConfig) {
  if (config.type === "local") {
    return {
      type: "local" as const,
      command: config.command ?? [],
      environment: config.environment ?? {},
      timeout: config.timeout,
    }
  }

  return {
    type: "remote" as const,
    url: config.url ?? "",
    headers: config.headers ?? {},
    timeout: config.timeout,
  }
}

function sameLease(a: SkillMcpLease, b: Pick<SkillMcpLease, "sessionID" | "skillName" | "serverName">) {
  return a.sessionID === b.sessionID && a.skillName === b.skillName && a.serverName === b.serverName
}

function otherConnectedLease(state: SkillMcpState, lease: Pick<SkillMcpLease, "sessionID" | "skillName" | "serverName">) {
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
  } catch {
    // Server may already exist globally or from another session lease; connect below.
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
  const state = await loadState(args.worktree)
  const bindings = bindingsForSkill(args.skillName)
  const activated: string[] = []
  const shared: string[] = []

  for (const binding of bindings) {
    const existing = state.leases.find((lease) => lease.sessionID === args.sessionID && lease.skillName === args.skillName && lease.serverName === binding.serverName)

    if (!existing) {
      const alreadyConnected = state.leases.some((lease) => lease.connected && lease.serverName === binding.serverName)
      if (!alreadyConnected) {
        await addAndConnect(args.client, args.directory, binding.serverName, binding.config)
        activated.push(binding.serverName)
      } else {
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
      if (!otherConnectedLease(state, existing)) {
        await addAndConnect(args.client, args.directory, existing.serverName, binding.config)
        activated.push(existing.serverName)
      } else {
        shared.push(existing.serverName)
      }
      existing.connected = true
      existing.updatedAt = nowIso()
    }
  }

  await saveState(args.worktree, state)
  return { activated, shared, totalBindings: bindings.length }
}

export async function releaseSkillMcpLeases(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  skillName?: string
}) {
  const state = await loadState(args.worktree)
  const released: string[] = []
  const retained: string[] = []
  const skipped: string[] = []

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

    await args.client.mcp.disconnect({
      path: { name: lease.serverName },
      query: { directory: args.directory },
    })
    released.push(lease.serverName)
  }

  await saveState(args.worktree, state)
  return { released, retained, skipped }
}

export async function listSkillMcpLeases(worktree: string) {
  return loadState(worktree)
}
