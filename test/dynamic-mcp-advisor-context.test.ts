import { afterEach, describe, expect, it, vi } from "vitest"

const { getAgentMcpStateMock, listRecentActivationIssuesMock, requestMcpMock } = vi.hoisted(() => ({
  getAgentMcpStateMock: vi.fn(async () => ({
    activeProfiles: [
      { agent: "ctf-web", sessionID: "session-1234567890abcdef", serverNames: ["filesystem", "browser"] },
    ],
    requests: [
      { id: "req-1", status: "pending", agent: "ctf-web", serverName: "flutter-aot", reason: "need reversing" },
    ],
  })),
  listRecentActivationIssuesMock: vi.fn(async () => [
    {
      phase: "activate",
      serverName: "browser",
      code: "timeout",
      updatedAt: "2026-08-01T00:00:00Z",
      message: "activation timeout",
    },
  ]),
  requestMcpMock: vi.fn(async () => ({
    requestIds: ["req-99"],
    results: [{ serverName: "flutter-aot", status: "pending" }],
  })),
}))

vi.mock("../src/dynamic-mcp-manager.ts", () => ({
  getAgentMcpState: getAgentMcpStateMock,
  listPendingRequests: vi.fn(async () => []),
  listRecentActivationIssues: listRecentActivationIssuesMock,
  requestMcp: requestMcpMock,
}))

describe("ctf-dynamic-mcp-advisor", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uses context.worktree for check mode instead of process cwd", async () => {
    const workspace = "C:/tmp/ctf-dynamic-worktree"
    const mod = await import("../tools/core/ctf-dynamic-mcp-advisor.ts")

    const out = await mod.default.execute({ action: "check" }, {
      worktree: workspace,
      directory: "C:/tmp/ctf-dynamic-directory",
      sessionID: "sess-1",
      agent: "ctf-web",
    } as never)

    expect(getAgentMcpStateMock).toHaveBeenCalledWith(workspace)
    expect(listRecentActivationIssuesMock).toHaveBeenCalledWith(workspace, {
      sessionID: "sess-1",
      agentName: "ctf-web",
    })
    expect(out).toContain("active_profiles: 1")
    expect(out).toContain("pending_requests: 1")
    expect(out).toContain("recent_activation_issues: 1")
  })

  it("passes context.worktree to request mode", async () => {
    const workspace = "C:/tmp/ctf-dynamic-request-worktree"
    const mod = await import("../tools/core/ctf-dynamic-mcp-advisor.ts")

    const out = await mod.default.execute({ action: "request", serverIds: ["flutter-aot"], reason: "need reversing" }, {
      worktree: workspace,
      directory: "C:/tmp/ctf-dynamic-request-directory",
      sessionID: "sess-2",
      agent: "ctf-rev",
    } as never)

    expect(requestMcpMock).toHaveBeenCalledWith({
      worktree: workspace,
      sessionID: "sess-2",
      agentName: "ctf-rev",
      serverNames: ["flutter-aot"],
      reason: "need reversing",
    })
    expect(out).toContain("request_submitted: 1")
    expect(out).toContain("flutter-aot: pending")
  })
})
