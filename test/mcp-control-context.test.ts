import { afterEach, describe, expect, it, vi } from "vitest"

const {
  createRuntimeClientMock,
  approveRequestMock,
  denyRequestMock,
  getAgentMcpStateMock,
  listRecentActivationIssuesMock,
  listAllRequestsMock,
  listPendingRequestsMock,
} = vi.hoisted(() => ({
  createRuntimeClientMock: vi.fn(() => ({ mcp: {} })),
  approveRequestMock: vi.fn(async () => ({
    ok: true,
    serverName: "ida-pro",
    agent: "ctf-rev",
    sessionID: "worker-session-123456",
    skillName: "agent-request:ctf-rev",
  })),
  denyRequestMock: vi.fn(async () => ({ ok: true, requestId: "req-1" })),
  getAgentMcpStateMock: vi.fn(async () => ({ activeProfiles: [], requests: [] })),
  listRecentActivationIssuesMock: vi.fn(async () => []),
  listAllRequestsMock: vi.fn(async () => []),
  listPendingRequestsMock: vi.fn(async () => []),
}))

vi.mock("../src/sdk.ts", () => ({
  createRuntimeClient: createRuntimeClientMock,
}))

vi.mock("../src/dynamic-mcp-manager.ts", () => ({
  approveRequest: approveRequestMock,
  denyRequest: denyRequestMock,
  getAgentMcpState: getAgentMcpStateMock,
  listRecentActivationIssues: listRecentActivationIssuesMock,
  listAllRequests: listAllRequestsMock,
  listPendingRequests: listPendingRequestsMock,
}))

describe("ctf-mcp-control context", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("falls back directory to context.worktree for approvals", async () => {
    const worktree = "C:/tmp/ctf-mcp-control-worktree"
    const mod = await import("../tools/core/ctf-mcp-control.ts")

    const out = await mod.default.execute({ action: "approve", requestId: "req-1", note: "needed for rev" }, {
      worktree,
    } as never)

    expect(createRuntimeClientMock).toHaveBeenCalledWith(worktree)
    expect(approveRequestMock).toHaveBeenCalledWith({
      client: { mcp: {} },
      worktree,
      directory: worktree,
      requestId: "req-1",
      decidedBy: "ctf-expert",
      note: "needed for rev",
    })
    expect(out).toContain("approved mcp=ida-pro")
  })
})
