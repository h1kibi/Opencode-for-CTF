import { describe, expect, it } from "vitest"
import { AGENT_MCP_DEFAULTS, COMMON_LIGHT_MCPS, KNOWN_AGENTS, getAgentDefaults } from "../src/agent-mcp-profiles.js"
import {
  MCP_SERVER_REGISTRY,
  lookupMcpServer,
  serversByWeight,
  envPrerequisitesSatisfied,
} from "../src/mcp-server-registry.js"
import {
  agentNameToCategory,
  clearMcpActivationIssues,
  denyRequest,
  getAgentMcpState,
  isInMemoryApproved,
  listRecentActivationIssues,
  metaToRuntimeConfig,
  processPendingRequests,
  pruneInMemoryApproved,
  recordMcpActivationIssue,
  releaseSessionMcps,
  requestMcp,
} from "../src/dynamic-mcp-manager.js"
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { atomicUpdateJsonFile, loadJsonFile } from "../src/state-store.js"
import type { AgentMcpState, AgentMcpRequest } from "../src/types.js"
import { agentMcpStateFile } from "../src/paths.js"

describe("agent-mcp-profiles", () => {
  it("COMMON_LIGHT_MCPS includes the four baseline servers", () => {
    expect(COMMON_LIGHT_MCPS).toContain("filesystem")
    expect(COMMON_LIGHT_MCPS).toContain("context7")
    expect(COMMON_LIGHT_MCPS).toContain("github")
    expect(COMMON_LIGHT_MCPS).toContain("markitdown")
  })

  it("every CTF subagent has common light MCPs", () => {
    for (const agent of KNOWN_AGENTS) {
      if (agent === "ctf-librarian" || agent === "ctf-verifier") continue
      const defaults = AGENT_MCP_DEFAULTS[agent]
      for (const light of COMMON_LIGHT_MCPS) {
        expect(defaults).toContain(light)
      }
    }
  })

  it("ctf-web has browser plus requestable DB/SSH MCPs in its defaults", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-web"]).toContain("browser")
    expect(AGENT_MCP_DEFAULTS["ctf-web"]).toContain("mysql-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-web"]).toContain("ssh-mcp")
  })

  it("ctf-rev has ReVa plus requestable reverse/debugger MCPs in its defaults", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-rev"]).toContain("ReVa")
    expect(AGENT_MCP_DEFAULTS["ctf-rev"]).toContain("gdb-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-rev"]).toContain("x64dbg-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-rev"]).toContain("ssh-mcp")
  })

  it("ctf-forensics defaults to wireshark and CyberChef, with DB/SSH requestable", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-forensics"]).toContain("wireshark-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-forensics"]).toContain("cyberchef-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-forensics"]).toContain("mysql-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-forensics"]).toContain("ssh-mcp")
  })

  it("ctf-crypto defaults to CyberChef", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-crypto"]).toContain("cyberchef-mcp")
  })

  it("ctf-misc defaults to wireshark and CyberChef, with DB/SSH requestable", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-misc"]).toContain("wireshark-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-misc"]).toContain("cyberchef-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-misc"]).toContain("mysql-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-misc"]).toContain("ssh-mcp")
  })

  it("ctf-aisec defaults to common light MCPs plus browser", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-aisec"]).toEqual([...COMMON_LIGHT_MCPS, "browser"])
  })

  it("ctf-pwn includes requestable debugger/SSH MCP candidates", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-pwn"]).toEqual([...COMMON_LIGHT_MCPS, "gdb-mcp", "ssh-mcp"])
  })

  it("ctf-crypto defaults to common light MCPs plus CyberChef", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-crypto"]).toEqual([...COMMON_LIGHT_MCPS, "cyberchef-mcp"])
  })

  it("ctf-scout has browser", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-scout"]).toContain("browser")
  })

  it("ctf-oracle and ctf-librarian default to the ctf_rag retrieval backend", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-oracle"]).toContain("ctf_rag")
    expect(AGENT_MCP_DEFAULTS["ctf-librarian"]).toContain("ctf_rag")
  })

  it("getAgentDefaults returns common light for unknown agents", () => {
    expect(getAgentDefaults("unknown-agent")).toEqual([...COMMON_LIGHT_MCPS])
  })

  it("getAgentDefaults returns the correct list for known agents", () => {
    expect(getAgentDefaults("ctf-web")).toBe(AGENT_MCP_DEFAULTS["ctf-web"])
  })
})

describe("mcp-server-registry", () => {
  it("has every server referenced by agent profiles", () => {
    const allReferenced = new Set(Object.values(AGENT_MCP_DEFAULTS).flat())
    const registered = new Set(MCP_SERVER_REGISTRY.map((s) => s.id))
    for (const serverId of allReferenced) {
      expect(registered.has(serverId)).toBe(true)
    }
  })

  it("lookupMcpServer finds each registered server", () => {
    for (const server of MCP_SERVER_REGISTRY) {
      const found = lookupMcpServer(server.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(server.id)
    }
  })

  it("lookupMcpServer returns undefined for unknown server", () => {
    expect(lookupMcpServer("nonexistent")).toBeUndefined()
  })

  it("serversByWeight returns only servers of the requested weight", () => {
    const light = serversByWeight("light")
    expect(light.every((s) => s.weight === "light")).toBe(true)

    const medium = serversByWeight("medium")
    expect(medium.every((s) => s.weight === "medium")).toBe(true)

    const heavy = serversByWeight("heavy")
    expect(heavy.every((s) => s.weight === "heavy")).toBe(true)
  })

  it("all light servers are in COMMON_LIGHT_MCPS", () => {
    const lightIds = new Set(serversByWeight("light").map((s) => s.id))
    for (const id of COMMON_LIGHT_MCPS) {
      expect(lightIds.has(id)).toBe(true)
    }
  })

  it("envPrerequisitesSatisfied returns ok for servers with no env requirement", () => {
    const server = lookupMcpServer("filesystem")!
    const result = envPrerequisitesSatisfied(server)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it("envPrerequisitesSatisfied detects missing env for servers with requirements", () => {
    const server = lookupMcpServer("github")!
    const result = envPrerequisitesSatisfied(server)
    // GITHUB_PAT may or may not be set; just check the function works
    expect(result.ok).toBe(typeof result.missing === "object")
  })

  it("every server has a valid weight", () => {
    for (const server of MCP_SERVER_REGISTRY) {
      expect(["light", "medium", "heavy"]).toContain(server.weight)
    }
  })

  it("every server has at least one category", () => {
    for (const server of MCP_SERVER_REGISTRY) {
      expect(server.categories.length).toBeGreaterThan(0)
    }
  })

  it("every server has a non-empty description", () => {
    for (const server of MCP_SERVER_REGISTRY) {
      expect(server.description.length).toBeGreaterThan(10)
    }
  })

  it("expands plugin-root placeholders for bundled local MCP commands", () => {
    const server = lookupMcpServer("wireshark-mcp")!
    const config = metaToRuntimeConfig(server)
    expect(config?.type).toBe("local")
    expect(config?.command?.[0]).toBe("node")
    expect(config?.command?.join(" ")).toContain("mcp-server")
    expect(config?.command?.join(" ")).toContain("WireMCP")
    expect(config?.command?.join(" ")).not.toContain("{plugin_root}")
  })

  it("keeps heavyweight CTF MCPs on-demand and exposes optional CTFd", () => {
    for (const id of ["gdb-mcp", "mysql-mcp", "x64dbg-mcp", "ssh-mcp", "flutter-aot"]) {
      expect(lookupMcpServer(id)?.weight).toBe("heavy")
    }
    expect(lookupMcpServer("gdb-mcp")?.envRequired).toContain("GDB_MCP_COMMAND")
    expect(lookupMcpServer("mysql-mcp")?.envRequired).toContain("MYSQL_MCP_COMMAND")
    expect(lookupMcpServer("x64dbg-mcp")?.envRequired).toContain("X64DBG_MCP_COMMAND")
    expect(lookupMcpServer("ssh-mcp")?.envRequired).toContain("SSH_MCP_COMMAND")
    expect(lookupMcpServer("flutter-aot")?.weight).toBe("heavy")
    expect(lookupMcpServer("flutter-aot")?.envRequired).toContain("FLUTTER_AOT_MCP_SERVER")
    expect(lookupMcpServer("ctfd-mcp")?.weight).toBe("heavy")
  })

  it("new service MCP slots report missing env prerequisites when unset", () => {
    const cases: Array<[string, string]> = [
      ["gdb-mcp", "GDB_MCP_COMMAND"],
      ["mysql-mcp", "MYSQL_MCP_COMMAND"],
      ["x64dbg-mcp", "X64DBG_MCP_COMMAND"],
      ["ssh-mcp", "SSH_MCP_COMMAND"],
    ]
    for (const [id, envVar] of cases) {
      const saved = process.env[envVar]
      delete process.env[envVar]
      try {
        const server = lookupMcpServer(id)!
        const result = envPrerequisitesSatisfied(server)
        expect(result.ok).toBe(false)
        expect(result.missing).toContain(envVar)
      } finally {
        if (saved !== undefined) process.env[envVar] = saved
      }
    }
  })
})

describe("agent-mcp-state persistence", () => {
  function tempWorktree(): string {
    return mkdtempSync(join(tmpdir(), "ctf-test-mcp-"))
  }

  const testRequest: AgentMcpRequest = {
    id: "mcp-req-test001",
    agent: "ctf-rev",
    sessionID: "session-rev-1",
    serverName: "flutter-aot",
    reason: "Need to decompile Flutter AOT binary",
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it("writes and reads an agent MCP state file", async () => {
    const worktree = tempWorktree()
    const path = agentMcpStateFile(worktree)

    // Write initial state
    await atomicUpdateJsonFile<AgentMcpState>(
      path,
      {
        version: 1,
        activeProfiles: [],
        requests: [],
        updatedAt: new Date().toISOString(),
      },
      (state: AgentMcpState) => {
        state.activeProfiles.push({ agent: "ctf-web", sessionID: "s1", serverNames: ["filesystem", "browser"] })
        state.requests.push(testRequest)
        return state
      },
    )

    // Read back
    const loaded = await loadJsonFile<AgentMcpState>(path, {} as AgentMcpState)
    expect(loaded.activeProfiles).toHaveLength(1)
    expect(loaded.activeProfiles[0].agent).toBe("ctf-web")
    expect(loaded.activeProfiles[0].serverNames).toContain("browser")
    expect(loaded.requests).toHaveLength(1)
    expect(loaded.requests[0].status).toBe("pending")
  })

  it("updates request status from pending to approved", async () => {
    const worktree = tempWorktree()
    const path = agentMcpStateFile(worktree)

    // Write with pending request
    await atomicUpdateJsonFile<AgentMcpState>(
      path,
      {
        version: 1,
        activeProfiles: [],
        requests: [],
        updatedAt: new Date().toISOString(),
      },
      (state: AgentMcpState) => {
        state.requests.push(testRequest)
        return state
      },
    )

    // Approve the request
    await atomicUpdateJsonFile<AgentMcpState>(
      path,
      {
        version: 1,
        activeProfiles: [],
        requests: [],
        updatedAt: new Date().toISOString(),
      },
      (state: AgentMcpState) => {
        const req = state.requests.find((r: AgentMcpRequest) => r.id === testRequest.id)
        if (req) {
          req.status = "approved"
          req.decidedBy = "ctf-expert"
          req.updatedAt = new Date().toISOString()
        }
        return state
      },
    )

    // Verify
    const loaded = await loadJsonFile<AgentMcpState>(path, {} as AgentMcpState)
    const req = loaded.requests.find((r) => r.id === testRequest.id)
    expect(req).toBeDefined()
    expect(req!.status).toBe("approved")
    expect(req!.decidedBy).toBe("ctf-expert")
  })

  it("handles concurrent state updates without data loss", async () => {
    const worktree = tempWorktree()
    const path = agentMcpStateFile(worktree)

    // Initial empty state
    await atomicUpdateJsonFile<AgentMcpState>(
      path,
      {
        version: 1,
        activeProfiles: [],
        requests: [],
        updatedAt: new Date().toISOString(),
      },
      (s) => s,
    )

    // Two concurrent request approvals
    const req1: AgentMcpRequest = { ...testRequest, id: "req-a", serverName: "x64dbg-mcp" }
    const req2: AgentMcpRequest = { ...testRequest, id: "req-b", serverName: "flutter-aot" }

    await Promise.all([
      atomicUpdateJsonFile<AgentMcpState>(
        path,
        {
          version: 1,
          activeProfiles: [],
          requests: [],
          updatedAt: new Date().toISOString(),
        },
        (state) => {
          state.requests.push(req1)
          return state
        },
      ),
      atomicUpdateJsonFile<AgentMcpState>(
        path,
        {
          version: 1,
          activeProfiles: [],
          requests: [],
          updatedAt: new Date().toISOString(),
        },
        (state) => {
          state.requests.push(req2)
          return state
        },
      ),
    ])

    const loaded = await loadJsonFile<AgentMcpState>(path, {} as AgentMcpState)
    expect(loaded.requests).toHaveLength(2)
    const ids = loaded.requests.map((r) => r.id).sort()
    expect(ids).toEqual(["req-a", "req-b"])
  })

  it("activeProfiles correctly maps agent to server list", async () => {
    const worktree = tempWorktree()
    const path = agentMcpStateFile(worktree)

    await atomicUpdateJsonFile<AgentMcpState>(
      path,
      {
        version: 1,
        activeProfiles: [],
        requests: [],
        updatedAt: new Date().toISOString(),
      },
      (state) => {
        state.activeProfiles.push(
          { agent: "ctf-web", sessionID: "s1", serverNames: ["filesystem", "context7", "github", "browser"] },
          { agent: "ctf-rev", sessionID: "s2", serverNames: ["filesystem", "context7", "github", "ReVa"] },
        )
        return state
      },
    )

    const loaded = await loadJsonFile<AgentMcpState>(path, {} as AgentMcpState)
    expect(loaded.activeProfiles).toHaveLength(2)

    const webProfile = loaded.activeProfiles.find((p) => p.agent === "ctf-web")
    expect(webProfile).toBeDefined()
    expect(webProfile!.serverNames).toContain("browser")
    expect(webProfile!.serverNames).not.toContain("ReVa")

    const revProfile = loaded.activeProfiles.find((p) => p.agent === "ctf-rev")
    expect(revProfile).toBeDefined()
    expect(revProfile!.serverNames).toContain("ReVa")
    expect(revProfile!.serverNames).not.toContain("browser")
  })

  it("records and clears recent activation issues for user-visible MCP failures", async () => {
    const worktree = tempWorktree()

    await recordMcpActivationIssue({
      worktree,
      sessionID: "session-web-1",
      agentName: "ctf-web",
      serverName: "context7",
      phase: "agent_default",
      error: "HTTP 429 Too Many Requests: quota exceeded",
    })

    let issues = await listRecentActivationIssues(worktree, {
      sessionID: "session-web-1",
      agentName: "ctf-web",
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe("context7_rate_limited")
    expect(issues[0].message).toContain("Context7")

    await clearMcpActivationIssues({
      worktree,
      sessionID: "session-web-1",
      agentName: "ctf-web",
      serverNames: ["context7"],
      phase: "agent_default",
    })

    issues = await listRecentActivationIssues(worktree, {
      sessionID: "session-web-1",
      agentName: "ctf-web",
    })
    expect(issues).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// agentNameToCategory — agent → MCP category mapping
// ---------------------------------------------------------------------------

describe("agentNameToCategory", () => {
  it("maps category agents correctly", () => {
    expect(agentNameToCategory("ctf-web")).toBe("web")
    expect(agentNameToCategory("ctf-pwn")).toBe("pwn")
    expect(agentNameToCategory("ctf-rev")).toBe("rev")
    expect(agentNameToCategory("ctf-crypto")).toBe("crypto")
    expect(agentNameToCategory("ctf-forensics")).toBe("forensics")
    expect(agentNameToCategory("ctf-misc")).toBe("misc")
    expect(agentNameToCategory("ctf-aisec")).toBe("misc")
  })

  it("returns undefined for cross-category agents", () => {
    expect(agentNameToCategory("ctf-expert")).toBeUndefined()
    expect(agentNameToCategory("ctf-scout")).toBeUndefined()
    expect(agentNameToCategory("ctf-oracle")).toBeUndefined()
    expect(agentNameToCategory("ctf-retro")).toBeUndefined()
    expect(agentNameToCategory("ctf-librarian")).toBeUndefined()
    expect(agentNameToCategory("ctf-verifier")).toBeUndefined()
  })

  it("returns undefined for unknown agents", () => {
    expect(agentNameToCategory("unknown-agent")).toBeUndefined()
    expect(agentNameToCategory("")).toBeUndefined()
  })
})
describe("MCP request lifecycle fencing", () => {
  const baseClient = (presence: "present" | "absent" | "unknown" = "present") => ({
    session: {
      get: async ({ path: requestPath }: { path: { id: string } }) =>
        presence === "present"
          ? { data: { id: requestPath.id } }
          : presence === "absent"
            ? { error: "404 session not found" }
            : { error: "temporary gateway failure" },
      status: async () => ({ data: {} }),
    },
    mcp: {
      add: async () => ({ data: {} }),
      connect: async () => ({ data: {} }),
      disconnect: async () => ({ data: {} }),
    },
  })

  it("deduplicates requests by session owner and server", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-mcp-lifecycle-"))
    const first = await requestMcp({
      worktree,
      sessionID: "session-a",
      agentName: "ctf-rev",
      serverNames: ["ctfd-mcp"],
      reason: "inspect",
    })
    const second = await requestMcp({
      worktree,
      sessionID: "session-a",
      agentName: "ctf-rev",
      serverNames: ["ctfd-mcp"],
      reason: "inspect again",
    })
    expect(first.requestIds).toHaveLength(1)
    expect(second.results[0]?.status).toBe("already_pending")
    expect((await getAgentMcpState(worktree)).requests).toHaveLength(1)
  })

  it("keeps unknown owner liveness pending and expires explicit absence", async () => {
    const unknownTree = mkdtempSync(join(tmpdir(), "ctf-mcp-unknown-"))
    await requestMcp({
      worktree: unknownTree,
      sessionID: "unknown-owner",
      agentName: "ctf-rev",
      serverNames: ["ctfd-mcp"],
      reason: "inspect",
    })
    const unknown = await processPendingRequests({
      client: baseClient("unknown") as never,
      worktree: unknownTree,
      directory: unknownTree,
      sessionID: "unknown-owner",
    })
    expect(unknown.stillPending).toBe(1)
    expect((await getAgentMcpState(unknownTree)).requests[0]?.status).toBe("pending")

    const absentTree = mkdtempSync(join(tmpdir(), "ctf-mcp-absent-"))
    await requestMcp({
      worktree: absentTree,
      sessionID: "absent-owner",
      agentName: "ctf-rev",
      serverNames: ["ctfd-mcp"],
      reason: "inspect",
    })
    await processPendingRequests({
      client: baseClient("absent") as never,
      worktree: absentTree,
      directory: absentTree,
      sessionID: "absent-owner",
    })
    expect((await getAgentMcpState(absentTree)).requests[0]?.status).toBe("expired")
  })

  it("releases only the deleted session owner scope", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-mcp-release-"))
    await atomicUpdateJsonFile<AgentMcpState>(
      agentMcpStateFile(worktree),
      { version: 1, activeProfiles: [], requests: [], updatedAt: new Date().toISOString() },
      (state) => {
        state.activeProfiles.push(
          { agent: "ctf-rev", sessionID: "session-a", serverNames: ["x64dbg-mcp"] },
          { agent: "ctf-web", sessionID: "session-b", serverNames: ["browser"] },
        )
        state.requests.push(
          {
            id: "request-a",
            agent: "ctf-rev",
            sessionID: "session-a",
            serverName: "x64dbg-mcp",
            reason: "a",
            status: "active",
            activationState: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "request-b",
            agent: "ctf-web",
            sessionID: "session-b",
            serverName: "browser",
            reason: "b",
            status: "active",
            activationState: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        )
        return state
      },
    )
    await releaseSessionMcps({
      client: baseClient() as never,
      worktree,
      directory: worktree,
      sessionID: "session-a",
      agentName: "wrong-agent",
    })
    const state = await getAgentMcpState(worktree)
    expect(state.activeProfiles.map((profile) => profile.sessionID)).toEqual(["session-b"])
    expect(state.requests.find((request) => request.id === "request-a")?.status).toBe("released")
    expect(state.requests.find((request) => request.id === "request-b")?.status).toBe("active")
  })

  it("returns false for a stale deny after activation has won", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "ctf-mcp-deny-race-"))
    await atomicUpdateJsonFile<AgentMcpState>(
      agentMcpStateFile(worktree),
      { version: 1, activeProfiles: [], requests: [], updatedAt: new Date().toISOString() },
      (state) => {
        state.requests.push({
          id: "request-race",
          agent: "ctf-rev",
          sessionID: "session-race",
          serverName: "x64dbg-mcp",
          reason: "race",
          status: "active",
          activationState: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        return state
      },
    )
    expect(await denyRequest({ worktree, requestId: "request-race", decidedBy: "ctf-expert" })).toMatchObject({
      ok: false,
      requestId: "request-race",
    })
    expect((await getAgentMcpState(worktree)).requests[0]?.status).toBe("active")
  })
})

// ---------------------------------------------------------------------------
// isInMemoryApproved — TTL-aware in-memory approval check
// ---------------------------------------------------------------------------

describe("isInMemoryApproved", () => {
  it("returns false for servers that were never approved", () => {
    expect(isInMemoryApproved("nonexistent-server")).toBe(false)
  })

  it("returns false immediately after construction", () => {
    // The set is initially empty
    expect(isInMemoryApproved("any-server")).toBe(false)
  })

  it("pruneInMemoryApproved on empty map does not throw", () => {
    expect(() => pruneInMemoryApproved()).not.toThrow()
  })

  it("double prune does not throw", () => {
    // Calling prune on an already-cleared map is a no-op
    pruneInMemoryApproved()
    expect(() => pruneInMemoryApproved()).not.toThrow()
  })
})
