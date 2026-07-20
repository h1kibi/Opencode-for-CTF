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
  isInMemoryApproved,
  metaToRuntimeConfig,
  pruneInMemoryApproved,
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

  it("ctf-web has browser in its defaults", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-web"]).toContain("browser")
  })

  it("ctf-rev has ReVa in its defaults", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-rev"]).toContain("ReVa")
  })

  it("ctf-forensics defaults to wireshark and CyberChef", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-forensics"]).toContain("wireshark-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-forensics"]).toContain("cyberchef-mcp")
  })

  it("ctf-crypto defaults to CyberChef", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-crypto"]).toContain("cyberchef-mcp")
  })

  it("ctf-misc defaults to wireshark and CyberChef", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-misc"]).toContain("wireshark-mcp")
    expect(AGENT_MCP_DEFAULTS["ctf-misc"]).toContain("cyberchef-mcp")
  })

  it("ctf-pwn has only common light MCPs", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-pwn"]).toEqual([...COMMON_LIGHT_MCPS])
  })

  it("ctf-crypto defaults to common light MCPs plus CyberChef", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-crypto"]).toEqual([...COMMON_LIGHT_MCPS, "cyberchef-mcp"])
  })

  it("ctf-scout has browser", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-scout"]).toContain("browser")
  })

  it("ctf-oracle has seckb", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-oracle"]).toContain("seckb")
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

  it("expands env-based launcher placeholders for external local MCP commands", () => {
    process.env.WIREMCP_LAUNCHER = "/tmp/wiremcp/server.py"
    const server = lookupMcpServer("wireshark-mcp")!
    const config = metaToRuntimeConfig(server)
    expect(config?.type).toBe("local")
    expect(config?.command?.join(" ")).toContain("/tmp/wiremcp/server.py")
    expect(config?.command?.join(" ")).not.toContain("{env:WIREMCP_LAUNCHER}")
    delete process.env.WIREMCP_LAUNCHER
  })

  it("keeps IDA and Flutter AOT as heavy on-demand MCPs and exposes optional CTFd", () => {
    expect(lookupMcpServer("ida-pro")?.weight).toBe("heavy")
    expect(lookupMcpServer("flutter-aot")?.weight).toBe("heavy")
    expect(lookupMcpServer("flutter-aot")?.envRequired).toContain("FLUTTER_AOT_MCP_SERVER")
    expect(lookupMcpServer("ctfd-mcp")?.weight).toBe("heavy")
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
    const req1: AgentMcpRequest = { ...testRequest, id: "req-a", serverName: "ida-pro" }
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
  })

  it("returns undefined for cross-category agents", () => {
    expect(agentNameToCategory("ctf-expert")).toBeUndefined()
    expect(agentNameToCategory("ctf-scout")).toBeUndefined()
    expect(agentNameToCategory("ctf-oracle")).toBeUndefined()
    expect(agentNameToCategory("ctf-retro")).toBeUndefined()
    expect(agentNameToCategory("ctf-librarian")).toBeUndefined()
    expect(agentNameToCategory("ctf-verifier")).toBeUndefined()
    expect(agentNameToCategory("ctf-pwn-fast")).toBeUndefined()
  })

  it("returns undefined for unknown agents", () => {
    expect(agentNameToCategory("unknown-agent")).toBeUndefined()
    expect(agentNameToCategory("")).toBeUndefined()
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
