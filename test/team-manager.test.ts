import { describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createTeam,
  addMember,
  listTeamState,
  sendTeamMessage,
  updateTaskStatus,
  createMemberTask,
} from "../src/team-manager.js"
import { teamStateFile } from "../src/paths.js"
import { loadJsonFile } from "../src/state-store.js"
import type { TeamState } from "../src/types.js"

function tempWorktree(): string {
  return mkdtempSync(join(tmpdir(), "ctf-test-team-"))
}

describe("team-manager", () => {
  it("createTeam returns a valid team", async () => {
    const worktree = tempWorktree()
    const team = await createTeam({
      worktree,
      directory: "/workspace/ctf",
      leadSessionID: "session-1",
      name: "my-ctf-team",
      challengeSlug: "web-100",
    })

    expect(team.teamId).toBe("my-ctf-team")
    expect(team.leadSessionID).toBe("session-1")
    expect(team.challengeSlug).toBe("web-100")
    expect(team.members).toEqual([])
    expect(team.tasks).toEqual([])
    expect(team.messages).toEqual([])
    expect(team.version).toBe(1)

    // Verify it was written to disk
    const statePath = teamStateFile(worktree, "/workspace/ctf", "my-ctf-team")
    const raw = JSON.parse(readFileSync(statePath, "utf-8"))
    expect(raw.teamId).toBe("my-ctf-team")
  })

  it("addMember adds a member to the team", async () => {
    const worktree = tempWorktree()
    await createTeam({
      worktree,
      directory: "/workspace/ctf",
      leadSessionID: "session-1",
      name: "team-a",
    })

    const updated = await addMember({
      worktree,
      directory: "/workspace/ctf",
      teamId: "team-a",
      leadSessionID: "session-1",
      memberName: "rev-agent",
      agent: "ctf-rev",
      description: "Reverse engineer",
    })

    expect(updated.members).toHaveLength(1)
    expect(updated.members[0].name).toBe("rev-agent")
    expect(updated.members[0].agent).toBe("ctf-rev")
    expect(updated.members[0].role).toBe("member")
    expect(updated.members[0].status).toBe("idle")
  })

  it("addMember can add multiple members", async () => {
    const worktree = tempWorktree()
    await createTeam({
      worktree,
      directory: "/workspace/ctf",
      leadSessionID: "session-1",
      name: "multi-team",
    })

    await addMember({
      worktree,
      directory: "/workspace/ctf",
      teamId: "multi-team",
      leadSessionID: "session-1",
      memberName: "pwn-agent",
      agent: "ctf-pwn",
    })

    await addMember({
      worktree,
      directory: "/workspace/ctf",
      teamId: "multi-team",
      leadSessionID: "session-1",
      memberName: "web-agent",
      agent: "ctf-web",
    })

    const state = await listTeamState({
      worktree,
      directory: "/workspace/ctf",
      teamId: "multi-team",
      leadSessionID: "session-1",
    })

    expect(state.members).toHaveLength(2)
    expect(state.members.map((m: { name: string }) => m.name).sort()).toEqual(["pwn-agent", "web-agent"])
  })

  it("listTeamState returns the full team state", async () => {
    const worktree = tempWorktree()
    await createTeam({
      worktree,
      directory: "/workspace/ctf",
      leadSessionID: "session-1",
      name: "list-test",
      challengeSlug: "pwn-200",
    })

    const state = await listTeamState({
      worktree,
      directory: "/workspace/ctf",
      teamId: "list-test",
      leadSessionID: "session-1",
    })

    expect(state.teamId).toBe("list-test")
    expect(state.challengeSlug).toBe("pwn-200")
    expect(state.members).toEqual([])
  })

  it("creating a team with special characters sanitises the team ID", async () => {
    const worktree = tempWorktree()
    const team = await createTeam({
      worktree,
      directory: "/workspace/ctf",
      leadSessionID: "session-1",
      name: "My CTF Team! Special Chars?",
    })

    expect(team.teamId).toBe("my_ctf_team__special_chars_")
    expect(team.teamId).not.toContain("!")
    expect(team.teamId).not.toContain("?")
    expect(team.teamId).not.toContain(" ")
  })

  it("team state persists to disk and can be re-loaded", async () => {
    const worktree = tempWorktree()
    await createTeam({
      worktree,
      directory: "/workspace/ctf",
      leadSessionID: "session-1",
      name: "persist-test",
    })

    await addMember({
      worktree,
      directory: "/workspace/ctf",
      teamId: "persist-test",
      leadSessionID: "session-1",
      memberName: "crypto-agent",
      agent: "ctf-crypto",
    })

    // Re-load from disk via loadJsonFile (simulating a new process)
    const statePath = teamStateFile(worktree, "/workspace/ctf", "persist-test")
    const fromDisk = await loadJsonFile<TeamState>(statePath, {} as TeamState)

    expect(fromDisk.teamId).toBe("persist-test")
    expect(fromDisk.members).toHaveLength(1)
    expect(fromDisk.members[0].name).toBe("crypto-agent")
  })

  // -----------------------------------------------------------------------
  // sendTeamMessage
  // -----------------------------------------------------------------------

  describe("sendTeamMessage", () => {
    it("adds a message between members", async () => {
      const worktree = tempWorktree()
      await createTeam({ worktree, directory: "/workspace/ctf", leadSessionID: "session-1", name: "msg-team" })

      const updated = await sendTeamMessage({
        worktree,
        directory: "/workspace/ctf",
        teamId: "msg-team",
        leadSessionID: "session-1",
        from: "alice",
        to: "bob",
        text: "hello bob",
      })

      expect(updated.messages).toHaveLength(1)
      expect(updated.messages[0].from).toBe("alice")
      expect(updated.messages[0].to).toBe("bob")
      expect(updated.messages[0].text).toBe("hello bob")
      expect(updated.messages[0].id).toMatch(/^msg_/)
    })

    it("appends multiple messages", async () => {
      const worktree = tempWorktree()
      await createTeam({ worktree, directory: "/workspace/ctf", leadSessionID: "session-1", name: "multi-msg" })

      await sendTeamMessage({
        worktree,
        directory: "/workspace/ctf",
        teamId: "multi-msg",
        leadSessionID: "session-1",
        from: "a",
        to: "b",
        text: "1",
      })
      await sendTeamMessage({
        worktree,
        directory: "/workspace/ctf",
        teamId: "multi-msg",
        leadSessionID: "session-1",
        from: "b",
        to: "a",
        text: "2",
      })

      const state = await listTeamState({
        worktree,
        directory: "/workspace/ctf",
        teamId: "multi-msg",
        leadSessionID: "session-1",
      })
      expect(state.messages).toHaveLength(2)
      expect(state.messages[0].text).toBe("1")
      expect(state.messages[1].text).toBe("2")
    })
  })

  // -----------------------------------------------------------------------
  // updateTaskStatus
  // -----------------------------------------------------------------------

  describe("updateTaskStatus", () => {
    it("updates a task from running to completed and sets member done", async () => {
      const worktree = tempWorktree()
      await createTeam({ worktree, directory: "/workspace/ctf", leadSessionID: "session-1", name: "status-team" })
      await addMember({
        worktree,
        directory: "/workspace/ctf",
        teamId: "status-team",
        leadSessionID: "session-1",
        memberName: "helper",
        agent: "ctf-web",
      })

      // First, get the team to find the member ID, then manually add a running task
      const statePath = teamStateFile(worktree, "/workspace/ctf", "status-team")
      const state = await loadJsonFile<TeamState>(statePath, {} as TeamState)
      const memberId = state.members[0].id

      // Manually set up a running task via atomicUpdateJsonFile
      const { atomicUpdateJsonFile } = await import("../src/state-store.js")
      await atomicUpdateJsonFile<TeamState>(statePath, {} as TeamState, (s: TeamState) => {
        s.tasks.push({
          id: "task_manual_1",
          memberId,
          title: "test-task",
          prompt: "do something",
          status: "running",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        s.members[0].status = "busy"
        return s
      })

      const result = await updateTaskStatus({
        worktree,
        directory: "/workspace/ctf",
        teamId: "status-team",
        leadSessionID: "session-1",
        taskId: "task_manual_1",
        status: "completed",
        resultSummary: "done well",
      })

      expect(result.tasks[0].status).toBe("completed")
      expect(result.tasks[0].resultSummary).toBe("done well")
      expect(result.members[0].status).toBe("done")
    })

    it("throws for unknown task ID", async () => {
      const worktree = tempWorktree()
      await createTeam({ worktree, directory: "/workspace/ctf", leadSessionID: "session-1", name: "bad-task-team" })

      await expect(
        updateTaskStatus({
          worktree,
          directory: "/workspace/ctf",
          teamId: "bad-task-team",
          leadSessionID: "session-1",
          taskId: "nonexistent",
          status: "completed",
        }),
      ).rejects.toThrow("task not found")
    })
  })

  // -----------------------------------------------------------------------
  // createMemberTask — with mocked client
  // -----------------------------------------------------------------------

  describe("createMemberTask", () => {
    it("creates a session and dispatches a prompt", async () => {
      const worktree = tempWorktree()
      await createTeam({ worktree, directory: "/workspace/ctf", leadSessionID: "session-1", name: "dispatch-team" })
      await addMember({
        worktree,
        directory: "/workspace/ctf",
        teamId: "dispatch-team",
        leadSessionID: "session-1",
        memberName: "worker",
        agent: "ctf-pwn",
      })

      // Load state from disk to get the real member ID
      const statePath = teamStateFile(worktree, "/workspace/ctf", "dispatch-team")
      const state = await loadJsonFile<TeamState>(statePath, {} as TeamState)
      const memberId = state.members[0].id

      const mockClient = {
        session: {
          create: vi.fn().mockResolvedValue({ data: { id: "sub-session-1" } }),
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      } as any

      const result = await createMemberTask({
        client: mockClient,
        worktree,
        directory: "/workspace/ctf",
        teamId: "dispatch-team",
        leadSessionID: "session-1",
        memberId,
        title: "bruteforce",
        prompt: "run hydra on port 22",
      })

      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe("bruteforce")
      expect(result.tasks[0].status).toBe("running")
      expect(mockClient.session.create).toHaveBeenCalledTimes(1)
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            agent: "ctf-pwn",
            parts: [expect.objectContaining({ text: "run hydra on port 22" })],
          }),
        }),
      )
    })
  })
})
