import { afterEach, describe, expect, it, vi } from "vitest"
import { clearActivatedDefaults, hasActivatedDefaults } from "../src/plugin-support.js"

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

import { handleToolExecuteBefore } from "../src/hooks/tool-hooks.ts"

describe("default MCP activation retry", () => {
  afterEach(() => {
    clearActivatedDefaults("session-retry")
    activateAgentDefaultsMock.mockReset()
    clearIssuesMock.mockReset()
    recordIssueMock.mockReset()
  })

  it("does not mark defaults complete when activation returned failures", async () => {
    activateAgentDefaultsMock.mockResolvedValue({
      activated: ["filesystem"],
      skipped: ["github (missing env: GITHUB_PAT)"],
      failed: [{ serverName: "context7", message: "Context7 is currently rate-limited or quota-exhausted." }],
    })

    const args = {
      meta: { tool: "skill", sessionID: "session-retry", agent: "ctf-expert" },
      output: { args: { name: "ctf-web-sqli" } },
      pluginConfig: { disabled_hooks: [] },
      enabledPacks: ["core", "web"],
      input: { client: {}, worktree: "C:\\tmp\\ctf-worktree", directory: "C:\\tmp\\ctf-worktree" },
      isHookEnabled: () => false,
      expertReadinessReport: () => ({ ready: true }),
      expertReadinessFailureText: () => "not used",
    }

    await handleToolExecuteBefore(args as never)
    expect(hasActivatedDefaults("session-retry")).toBe(false)

    await handleToolExecuteBefore(args as never)
    expect(activateAgentDefaultsMock).toHaveBeenCalledTimes(2)
  })
})
