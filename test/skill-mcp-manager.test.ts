import { describe, expect, it } from "vitest"
import type { SkillMcpLease, SkillMcpState } from "../src/types.js"
import { toSdkConfig, sameLease, otherConnectedLease } from "../src/skill-mcp-manager.js"

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
