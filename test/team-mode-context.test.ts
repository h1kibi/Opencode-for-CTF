import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const { createRuntimeClientMock, createMemberTaskMock, loadCtfToolsMock } = vi.hoisted(() => ({
  createRuntimeClientMock: vi.fn(() => ({ mocked: true })),
  createMemberTaskMock: vi.fn(async (args: { memberId: string; runtimeVisibility?: unknown }) => ({
    members: [{ id: args.memberId, name: "worker", agent: "ctf-scout", sessionID: "child-session" }],
    tasks: [{ id: "task-1", status: "running" }],
  })),
  loadCtfToolsMock: vi.fn(async () => ({ "ctf-tool-packs": {}, "ctf-team-mode": {} })),
}))

vi.mock("../src/sdk.ts", () => ({
  createRuntimeClient: createRuntimeClientMock,
}))

vi.mock("../src/team-manager.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/team-manager.ts")>("../src/team-manager.ts")
  return {
    ...actual,
    createMemberTask: createMemberTaskMock,
  }
})

vi.mock("../src/ctf-tools.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/ctf-tools.ts")>("../src/ctf-tools.ts")
  return {
    ...actual,
    loadCtfTools: loadCtfToolsMock,
  }
})

describe("ctf-team-mode", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("builds runtime visibility from context.directory instead of process cwd", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-team-mode-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-team-mode-other-"))
    const skillName = "zz-team-mode-local-skill"
    mkdirSync(join(workspace, "skills", skillName), { recursive: true })
    writeFileSync(
      join(workspace, "opencode-for-ctf.jsonc"),
      JSON.stringify({ tool_packs: ["core", "godot"], external_skills: true }),
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-team-mode.ts")
      const out = await mod.default.execute(
        {
          operation: "create_task",
          teamId: "team-1",
          memberId: "member-1",
          title: "triage",
          prompt: "inspect challenge",
        },
        { directory: workspace, worktree: workspace, sessionID: "lead-1" } as never,
      )

      expect(out).toContain("operation: create_task")
    } finally {
      process.chdir(prev)
    }

    expect(createRuntimeClientMock).toHaveBeenCalledWith(workspace)
    expect(loadCtfToolsMock).toHaveBeenCalledWith({ packs: ["core", "godot"] })
    expect(createMemberTaskMock).toHaveBeenCalledTimes(1)

    const runtimeVisibility = (createMemberTaskMock.mock.calls[0]?.[0] as { runtimeVisibility?: any } | undefined)
      ?.runtimeVisibility
    expect(runtimeVisibility?.expectedSkills).toEqual([skillName])
    expect(runtimeVisibility?.externalSkillsEnabled).toBe(true)
    expect(runtimeVisibility?.pluginToolCount).toBe(2)
    expect(runtimeVisibility?.exportedToolNames).toEqual(["ctf-tool-packs", "ctf-team-mode"])
  })
})
