import { describe, expect, it } from "vitest"
import type { SkillMcpLease, SkillMcpState } from "../src/types.js"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { skillMcpStateFile } from "../src/paths.js"
import {
  describeMcpActivationError,
  ensureNamedServerLeases,
  ensureSkillMcpLeases,
  leaseIsConnected,
  releaseSkillMcpLeases,
  sameLease,
  otherConnectedLease,
  toSdkConfig,
} from "../src/skill-mcp-manager.js"

// ---------------------------------------------------------------------------
// toSdkConfig
// ---------------------------------------------------------------------------

describe("toSdkConfig", () => {
  it("converts a local config", () => {
    const result = toSdkConfig({
      type: "local",
      command: ["npx", "serve", "."],
      environment: { NODE_ENV: "test" },
      timeout: 30_000,
    })
    expect(result.type).toBe("local")
    expect(result.command).toEqual(["npx", "serve", "."])
    expect(result.environment).toEqual({ NODE_ENV: "test" })
    expect(result.timeout).toBe(30_000)
  })

  it("fills defaults for local config with missing fields", () => {
    const result = toSdkConfig({ type: "local" })
    expect(result.type).toBe("local")
    expect(result.command).toEqual([])
    expect(result.environment).toEqual({})
    expect(result.timeout).toBeUndefined()
  })

  it("converts a remote config", () => {
    const result = toSdkConfig({
      type: "remote",
      url: "https://api.example.com/mcp",
      headers: { Authorization: "Bearer token" },
      timeout: 15_000,
    })
    expect(result.type).toBe("remote")
    expect(result.url).toBe("https://api.example.com/mcp")
    expect(result.headers).toEqual({ Authorization: "Bearer token" })
    expect(result.timeout).toBe(15_000)
  })

  it("fills defaults for remote config with missing fields", () => {
    const result = toSdkConfig({ type: "remote" })
    expect(result.type).toBe("remote")
    expect(result.url).toBe("")
    expect(result.headers).toEqual({})
    expect(result.timeout).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sameLease
// ---------------------------------------------------------------------------

describe("sameLease", () => {
  const lease: SkillMcpLease = {
    skillName: "ctf-web",
    sessionID: "session-1",
    serverName: "browser",
    connected: true,
    disconnectWhenIdle: true,
    config: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }

  it("returns true when all three match", () => {
    expect(sameLease(lease, { sessionID: "session-1", skillName: "ctf-web", serverName: "browser" })).toBe(true)
  })

  it("returns false when sessionID differs", () => {
    expect(sameLease(lease, { sessionID: "session-2", skillName: "ctf-web", serverName: "browser" })).toBe(false)
  })

  it("returns false when skillName differs", () => {
    expect(sameLease(lease, { sessionID: "session-1", skillName: "ctf-pwn", serverName: "browser" })).toBe(false)
  })

  it("returns false when serverName differs", () => {
    expect(sameLease(lease, { sessionID: "session-1", skillName: "ctf-web", serverName: "filesystem" })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// otherConnectedLease
// ---------------------------------------------------------------------------

describe("otherConnectedLease", () => {
  const baseLease: SkillMcpLease = {
    skillName: "ctf-web",
    sessionID: "session-1",
    serverName: "filesystem",
    connected: true,
    disconnectWhenIdle: false,
    config: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }

  function makeState(leases: SkillMcpLease[]): SkillMcpState {
    return { version: 1, leases, updatedAt: "2026-01-01T00:00:00.000Z" }
  }

  it("returns true when another session has the same server connected", () => {
    const state = makeState([{ ...baseLease }, { ...baseLease, sessionID: "session-2" }])
    expect(otherConnectedLease(state, { sessionID: "session-1", skillName: "ctf-web", serverName: "filesystem" })).toBe(
      true,
    )
  })

  it("returns false when no other session has the same server connected", () => {
    const state = makeState([{ ...baseLease }])
    expect(otherConnectedLease(state, { sessionID: "session-1", skillName: "ctf-web", serverName: "filesystem" })).toBe(
      false,
    )
  })

  it("returns false when other session has same server but disconnected", () => {
    const state = makeState([{ ...baseLease }, { ...baseLease, sessionID: "session-2", connected: false }])
    expect(otherConnectedLease(state, { sessionID: "session-1", skillName: "ctf-web", serverName: "filesystem" })).toBe(
      false,
    )
  })

  it("returns false when other session has a different server connected", () => {
    const state = makeState([{ ...baseLease }, { ...baseLease, sessionID: "session-2", serverName: "browser" }])
    expect(otherConnectedLease(state, { sessionID: "session-1", skillName: "ctf-web", serverName: "filesystem" })).toBe(
      false,
    )
  })

  it("returns true when multiple other sessions have the same server", () => {
    const state = makeState([
      { ...baseLease },
      { ...baseLease, sessionID: "session-2" },
      { ...baseLease, sessionID: "session-3" },
    ])
    expect(otherConnectedLease(state, { sessionID: "session-1", skillName: "ctf-web", serverName: "filesystem" })).toBe(
      true,
    )
  })
})

describe("describeMcpActivationError", () => {
  it("classifies Context7 rate-limit failures with actionable guidance", () => {
    const result = describeMcpActivationError("context7", "HTTP 429 Too Many Requests: quota exceeded")
    expect(result.code).toBe("context7_rate_limited")
    expect(result.message).toContain("Context7")
    expect(result.message).toContain("rate-limited")
  })

  it("classifies remote auth failures generically", () => {
    const result = describeMcpActivationError("runtime_anysearch_remote", "401 Unauthorized")
    expect(result.code).toBe("remote_auth_failed")
    expect(result.message).toContain("authentication failed")
  })
})

describe("ensureSkillMcpLeases", () => {
  it("records a successful skill binding and never persists a failed one", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-skill-mcp-"))
    let fail = true
    const client = {
      mcp: {
        add: async () => undefined,
        connect: async ({ path }: { path: { name: string } }) => {
          if (path.name === "runtime_context7_java" && fail) {
            throw new Error("HTTP 429 Too Many Requests: quota exceeded")
          }
        },
      },
    }

    const failed = await ensureSkillMcpLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "ctf-web-java",
    })

    expect(failed.activated).toEqual([])
    expect(failed.failed).toHaveLength(1)
    expect(failed.failed[0].serverName).toBe("runtime_context7_java")
    expect(failed.failed[0].message).toMatch(/rate-limited/i)
    // A failed binding must not be recorded as an active lease.
    expect(loadLeases(worktree).filter((lease) => leaseIsConnected(lease))).toEqual([])

    fail = false
    const activated = await ensureSkillMcpLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "ctf-web-java",
    })

    expect(activated.activated).toContain("runtime_context7_java")
    expect(activated.failed).toEqual([])
    const leases = loadLeases(worktree).filter((lease) => leaseIsConnected(lease))
    expect(leases.map((lease) => lease.serverName)).toEqual(["runtime_context7_java"])
    expect(leases[0].skillName).toBe("ctf-web-java")
  })
})

// ---------------------------------------------------------------------------
// Lease lifecycle state machine (claim / share / release / compensation)
// ---------------------------------------------------------------------------

const SERVER = { serverName: "runtime_test_server", config: { type: "local" as const, command: ["node", "x.mjs"] } }

function makeClient(overrides?: {
  connect?: (name: string) => Promise<void>
  disconnect?: (name: string) => Promise<void>
}) {
  const connects: string[] = []
  const disconnects: string[] = []
  return {
    client: {
      mcp: {
        add: async () => undefined,
        connect: async ({ path }: { path: { name: string } }) => {
          connects.push(path.name)
          await overrides?.connect?.(path.name)
        },
        disconnect: async ({ path }: { path: { name: string } }) => {
          disconnects.push(path.name)
          await overrides?.disconnect?.(path.name)
        },
      },
    },
    connects,
    disconnects,
  }
}

function loadLeases(worktree: string): SkillMcpLease[] {
  try {
    return (JSON.parse(readFileSync(skillMcpStateFile(worktree), "utf8")) as SkillMcpState).leases
  } catch {
    return [] // state file not created yet (claim still in flight)
  }
}

describe("lease lifecycle state machine", () => {
  it("shares an already-connected server without a second external connect", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-lease-share-"))
    const { client, connects } = makeClient()

    const first = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(first.activated).toEqual(["runtime_test_server"])
    expect(connects).toHaveLength(1)

    const second = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-2",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(second.activated).toEqual([])
    expect(second.shared).toContain("runtime_test_server")
    expect(connects).toHaveLength(1)

    const leases = loadLeases(worktree)
    expect(leases.filter((lease) => leaseIsConnected(lease))).toHaveLength(2)
  })

  it("re-ensure for the same session is idempotent (no duplicate connect)", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-lease-idem-"))
    const { client, connects } = makeClient()

    await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    const again = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(again.activated).toEqual([])
    expect(connects).toHaveLength(1)
  })

  it("concurrent claims for the same server produce exactly one external connect", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-lease-race-"))
    let releaseConnect!: () => void
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve
    })
    const { client, connects } = makeClient({ connect: () => connectGate })

    const first = ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })

    // Wait until the first caller's claim is persisted as `connecting`.
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const leases = loadLeases(worktree)
      if (leases.some((lease) => lease.status === "connecting")) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(loadLeases(worktree).some((lease) => lease.status === "connecting")).toBe(true)

    // Second caller must see the fresh `connecting` claim and NOT connect.
    const second = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-2",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(second.activated).toEqual([])
    expect(connects).toHaveLength(1)

    releaseConnect()
    const firstResult = await first
    expect(firstResult.activated).toEqual(["runtime_test_server"])
    expect(connects).toHaveLength(1)

    // B's pending lease resolves on the next ensure without connecting again.
    const secondAgain = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-2",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(secondAgain.activated).toEqual([])
    expect(connects).toHaveLength(1)
    expect(loadLeases(worktree).filter((lease) => leaseIsConnected(lease))).toHaveLength(2)
  })

  it("removes the claim when the external connect fails, allowing a clean retry", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-lease-fail-"))
    let fail = true
    const { client, connects } = makeClient({
      connect: async (name) => {
        if (fail) throw new Error("remote_unreachable: ECONNREFUSED")
        void name
      },
    })

    const failed = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(failed.activated).toEqual([])
    expect(failed.failed.map((f) => f.serverName)).toEqual(["runtime_test_server"])
    // No ghost lease left behind.
    expect(loadLeases(worktree)).toHaveLength(0)

    fail = false
    const retried = await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })
    expect(retried.activated).toEqual(["runtime_test_server"])
    expect(connects).toHaveLength(2)
  })

  it("reverts to connected when the external disconnect fails (compensation)", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-lease-dc-"))
    let failDisconnect = true
    const { client } = makeClient({
      disconnect: async () => {
        if (failDisconnect) throw new Error("server already gone")
      },
    })

    await ensureNamedServerLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
      servers: [SERVER],
    })

    const released = await releaseSkillMcpLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
    })
    expect(released.disconnectFailed).toEqual(["runtime_test_server"])
    // State must NOT claim disconnected while the connection may still be live.
    const leases = loadLeases(worktree)
    const lease = leases.find((item) => item.serverName === "runtime_test_server")
    expect(lease && leaseIsConnected(lease)).toBe(true)

    // A later release with a working disconnect completes the cycle.
    failDisconnect = false
    const second = await releaseSkillMcpLeases({
      client: client as never,
      worktree,
      directory: worktree,
      sessionID: "session-1",
      skillName: "agent-default:ctf-web",
    })
    expect(second.released).toEqual(["runtime_test_server"])
    expect(second.disconnectFailed).toEqual([])
    expect(leaseIsConnected(loadLeases(worktree)[0])).toBe(false)
  })
  it("blocks reacquisition while a prior disconnect is in flight", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-lease-disconnect-race-"))
    let resolveDisconnectStarted!: () => void
    let resolveDisconnectGate!: () => void
    const disconnectStarted = new Promise<void>((resolve) => { resolveDisconnectStarted = resolve })
    const disconnectGate = new Promise<void>((resolve) => { resolveDisconnectGate = resolve })
    const { client, connects } = makeClient({
      disconnect: async () => {
        resolveDisconnectStarted()
        await disconnectGate
      },
    })
    await ensureNamedServerLeases({ client: client as never, worktree, directory: worktree, sessionID: "session-a", skillName: "agent-default:ctf-web", servers: [SERVER] })
    releaseSkillMcpLeases({ client: client as never, worktree, directory: worktree, sessionID: "session-a", skillName: "agent-default:ctf-web" })
    await disconnectStarted
    expect(loadLeases(worktree).some((lease) => lease.status === "disconnecting")).toBe(true)
    const acquiring = await ensureNamedServerLeases({ client: client as never, worktree, directory: worktree, sessionID: "session-b", skillName: "agent-default:ctf-web", servers: [SERVER] })
    expect(acquiring.activated).toEqual([])
    expect(acquiring.shared).toContain("runtime_test_server")
    expect(connects).toHaveLength(1)
    resolveDisconnectGate()
    const after = loadLeases(worktree)
    expect(after.find((lease) => lease.sessionID === "session-b")?.status).toBe("pending")
  })
})
