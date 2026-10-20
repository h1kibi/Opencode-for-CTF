import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

const { activateAgentDefaultsMock, clearIssuesMock, recordIssueMock } = vi.hoisted(() => ({
  activateAgentDefaultsMock: vi.fn(),
  clearIssuesMock: vi.fn(),
  recordIssueMock: vi.fn(),
}))

vi.mock("../src/dynamic-mcp-manager.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/dynamic-mcp-manager.ts")>("../src/dynamic-mcp-manager.ts")
  return {
    ...actual,
    activateAgentDefaults: activateAgentDefaultsMock,
    clearMcpActivationIssues: clearIssuesMock,
    recordMcpActivationIssue: recordIssueMock,
  }
})

import { AGENT_MCP_DEFAULTS, COMMON_LIGHT_MCPS, getAgentDefaults } from "../src/agent-mcp-profiles.ts"
import { envPrerequisitesSatisfied, lookupMcpServer } from "../src/mcp-server-registry.ts"
import { metaToRuntimeConfig } from "../src/mcp/mcp-runtime-adapter.ts"
import { activateAgentDefaultsOnce, clearActivatedDefaults, hasActivatedDefaults } from "../src/plugin-support.ts"
import {
  FAST_MCP_SERVER_PREFIXES,
  FAST_MCP_TOOL_NAMES,
  FAST_TOOL_ALLOWLIST,
  toolAllowedForAgent,
} from "../src/tool-packs.ts"
import { handleToolExecuteBefore } from "../src/hooks/tool-hooks.ts"

const SERVER_ID = "ctf_rag"
const REQUIRED_ENV = ["CTF_RAG_PYTHON", "CTF_RAG_ROOT", "CTF_RAG_KB_ROOT"] as const

function hookArgs(overrides: { sessionID: string; agent: string }) {
  return {
    meta: { tool: "ctf-route-plan", sessionID: overrides.sessionID, agent: overrides.agent },
    output: { args: {} },
    pluginConfig: { disabled_hooks: [] },
    enabledPacks: ["core"],
    input: { client: {}, worktree: "C:\\tmp\\ctf-worktree", directory: "C:\\tmp\\ctf-worktree" },
    isHookEnabled: () => false,
    expertReadinessReport: () => ({ ready: true }),
    expertReadinessFailureText: () => "not used",
  } as never
}

const withEnv = <T>(values: Record<string, string | undefined>, fn: () => T): T => {
  const saved = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

afterEach(() => {
  activateAgentDefaultsMock.mockReset()
  clearIssuesMock.mockReset()
  recordIssueMock.mockReset()
})

describe("ctf_rag MCP registration", () => {
  it("registers a read-only local server with the env prerequisites it needs", () => {
    const server = lookupMcpServer(SERVER_ID)
    expect(server).toBeDefined()
    // Read-only retrieval must run on the default profile, so it cannot be heavy.
    expect(server!.weight).toBe("medium")
    expect(server!.categories).toEqual(expect.arrayContaining(["web", "pwn", "rev", "crypto", "forensics", "misc"]))
    expect(server!.envRequired).toEqual([...REQUIRED_ENV])
  })

  it("launches the interpreter with PYTHONPATH instead of a working directory", () => {
    const config = withEnv(
      {
        CTF_RAG_PYTHON: "C:\\rag\\.venv\\Scripts\\python.exe",
        CTF_RAG_ROOT: "C:\\rag",
        CTF_RAG_KB_ROOT: "C:\\rag-data\\knowledge_base",
      },
      () => metaToRuntimeConfig(lookupMcpServer(SERVER_ID)!),
    )
    expect(config?.type).toBe("local")
    expect(config?.command).toEqual(["C:\\rag\\.venv\\Scripts\\python.exe", "-m", "rag_service.mcp_server"])
    // An MCP client cannot pass a cwd, so the module must be importable by PYTHONPATH.
    expect(config?.environment?.PYTHONPATH).toBe("C:\\rag")
    expect(config?.environment?.RAG_KB_ROOT).toBe("C:\\rag-data\\knowledge_base")
    expect(config?.command?.join(" ")).not.toContain("{env:")
  })

  it("keeps corpus identity, embedding target and lexical fallback as literals", () => {
    // A placeholder would expand to "" when unset and silently point the service
    // at the wrong knowledge base, model, or a hard-failing embedder.
    const config = withEnv({ CTF_RAG_PYTHON: "python", CTF_RAG_ROOT: "C:\\rag", CTF_RAG_KB_ROOT: "C:\\kb" }, () =>
      metaToRuntimeConfig(lookupMcpServer(SERVER_ID)!),
    )
    expect(config?.environment).toMatchObject({
      RAG_ALLOWED_KNOWLEDGE_BASES: "cybersec",
      RAG_DEFAULT_KNOWLEDGE_BASE: "cybersec",
      RAG_EMBEDDING_MODEL: "bge-m3",
      RAG_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      RAG_LEXICAL_FALLBACK: "1",
    })
  })

  it("reports missing env instead of activating a half-configured server", () => {
    const server = lookupMcpServer(SERVER_ID)!
    const missing = withEnv({ CTF_RAG_PYTHON: undefined, CTF_RAG_ROOT: undefined, CTF_RAG_KB_ROOT: undefined }, () =>
      envPrerequisitesSatisfied(server),
    )
    expect(missing.ok).toBe(false)
    expect(missing.missing).toEqual([...REQUIRED_ENV])

    const present = withEnv({ CTF_RAG_PYTHON: "p", CTF_RAG_ROOT: "r", CTF_RAG_KB_ROOT: "k" }, () =>
      envPrerequisitesSatisfied(server),
    )
    expect(present).toEqual({ ok: true, missing: [] })
  })
})

describe("ctf-fast default MCP profile", () => {
  it("adds local retrieval to the fast defaults on top of the common baseline", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-fast"]).toEqual([...COMMON_LIGHT_MCPS, SERVER_ID])
    expect(getAgentDefaults("ctf-fast")).toContain(SERVER_ID)
  })

  it("activates the fast profile on a plain tool call, without a lane skill", async () => {
    // Neither primary lane has a skill of its own (`skillToAgent` resolves only
    // category/meta skills), so activation cannot depend on a skill call.
    activateAgentDefaultsMock.mockResolvedValue({ activated: [SERVER_ID], skipped: [], failed: [] })
    clearActivatedDefaults("session-fast-1")
    await handleToolExecuteBefore(hookArgs({ sessionID: "session-fast-1", agent: "ctf-fast" }))

    expect(activateAgentDefaultsMock).toHaveBeenCalledTimes(1)
    expect(activateAgentDefaultsMock.mock.calls[0][0]).toMatchObject({
      sessionID: "session-fast-1",
      agentName: "ctf-fast",
    })
  })
})

describe("ctf_rag fast-lane reachability", () => {
  it("allows both the declared tool name and its host-namespaced form", () => {
    expect(FAST_MCP_SERVER_PREFIXES).toEqual(["ctf_rag_"])
    // The live server declares exactly this tool name (verified via listTools).
    expect(FAST_MCP_TOOL_NAMES.has("ctf_rag")).toBe(true)
    expect(toolAllowedForAgent("ctf_rag", "ctf-fast")).toBe(true)
    expect(toolAllowedForAgent("ctf_rag_ctf_rag", "ctf-fast")).toBe(true)
    // Neither spelling is a wildcard for other MCP tools.
    expect(toolAllowedForAgent("github_search_code", "ctf-fast")).toBe(false)
    expect(toolAllowedForAgent("browser_navigate", "ctf-fast")).toBe(false)
    expect(toolAllowedForAgent("ctf-team-dispatch", "ctf-fast")).toBe(false)
    expect(toolAllowedForAgent("ctf_ragx", "ctf-fast")).toBe(false)
  })

  it("keeps the CTF tool allowlist itself unchanged", () => {
    for (const name of ["ctf-route-plan", "ctf-evidence-board", "ctf-python-inline"]) {
      expect(FAST_TOOL_ALLOWLIST.has(name)).toBe(true)
    }
    expect(FAST_TOOL_ALLOWLIST.has(SERVER_ID)).toBe(false)
  })

  it("leaves non-fast agents unrestricted", () => {
    expect(toolAllowedForAgent("github_search_code", "ctf-expert")).toBe(true)
    expect(toolAllowedForAgent("browser_navigate", "ctf-expert")).toBe(true)
  })
})

describe("default profile activation bookkeeping", () => {
  const base = { client: {} as never, worktree: "C:\\tmp\\ctf", directory: "C:\\tmp\\ctf" }

  it("activates at most once per session and agent, then retries after a failure", async () => {
    clearActivatedDefaults("s1")
    activateAgentDefaultsMock.mockResolvedValueOnce({
      activated: ["filesystem"],
      skipped: [`${SERVER_ID} (missing env: CTF_RAG_PYTHON)`],
      failed: [{ serverName: SERVER_ID, message: "ctf_rag is unreachable" }],
    })
    const first = await activateAgentDefaultsOnce({ ...base, sessionID: "s1", agentName: "ctf-fast" })
    expect(first.attempted).toBe(true)
    expect(recordIssueMock).toHaveBeenCalled()
    // A partial profile must stay retryable.
    expect(hasActivatedDefaults("s1", "ctf-fast")).toBe(false)

    activateAgentDefaultsMock.mockResolvedValueOnce({ activated: [SERVER_ID], skipped: [], failed: [] })
    const second = await activateAgentDefaultsOnce({ ...base, sessionID: "s1", agentName: "ctf-fast" })
    expect(second.activated).toEqual([SERVER_ID])
    expect(hasActivatedDefaults("s1", "ctf-fast")).toBe(true)

    const third = await activateAgentDefaultsOnce({ ...base, sessionID: "s1", agentName: "ctf-fast" })
    expect(third.attempted).toBe(false)
    expect(activateAgentDefaultsMock).toHaveBeenCalledTimes(2)
  })

  it("still activates the expert profile after a session was promoted from fast", async () => {
    clearActivatedDefaults("s2")
    activateAgentDefaultsMock.mockResolvedValue({ activated: ["filesystem"], skipped: [], failed: [] })
    await activateAgentDefaultsOnce({ ...base, sessionID: "s2", agentName: "ctf-fast" })
    expect(hasActivatedDefaults("s2", "ctf-fast")).toBe(true)

    await activateAgentDefaultsOnce({ ...base, sessionID: "s2", agentName: "ctf-expert" })
    expect(activateAgentDefaultsMock).toHaveBeenCalledTimes(2)
    clearActivatedDefaults("s2")
    // Clearing is per session, not per `session\0agent` key.
    expect(hasActivatedDefaults("s2", "ctf-fast")).toBe(false)
    expect(hasActivatedDefaults("s2", "ctf-expert")).toBe(false)
  })
})

describe("ctf_rag configuration surface", () => {
  it("documents the server and its env vars in the shipped config surfaces", () => {
    const example = readFileSync("opencode-for-ctf.example.jsonc", "utf8")
    const env = readFileSync(".env.example", "utf8")
    const rule = readFileSync("rules/agent-equipment.md", "utf8")
    const agent = readFileSync("agents/ctf-fast.md", "utf8")

    expect(example).toContain(SERVER_ID)
    for (const name of REQUIRED_ENV) {
      expect(env).toContain(name)
      expect(rule).toContain(name)
    }
    expect(rule).toContain(SERVER_ID)
    expect(agent).toContain("ctf_rag")
  })

  it("keeps the example config free of a static ctf_rag stub", () => {
    // A static stub needs `{env:}` placeholders holding Windows paths, and the
    // host expands those into config TEXT before parsing it, so the stub makes
    // the whole config unparseable. Only commented guidance is acceptable.
    const example = readFileSync("opencode-for-ctf.example.jsonc", "utf8")
    for (const line of example.split(/\r?\n/)) {
      if (!line.includes(SERVER_ID)) continue
      expect(line.trim().startsWith("//"), `uncommented ctf_rag config line: ${line}`).toBe(true)
    }
    expect(example).not.toMatch(/^\s*"ctf_rag"\s*:/m)
  })

  it("keeps the documented MCP server id free of the MCP tool-name separator", () => {
    // The server declares its tool as `ctf_rag`, so a dashed server id would
    // produce `ctf-rag_ctf_rag`, which the fast-lane rules cannot match.
    const id = lookupMcpServer(SERVER_ID)!.id
    expect(id).toMatch(/^[a-z0-9_]+$/)
  })
})
