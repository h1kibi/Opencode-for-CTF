import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveFileLockPaths, withFileLock } from "../src/file-lock.ts"
import { inspectTeamLockState, normalizeTeamState } from "../src/team/team-state.ts"
import type { TeamState } from "../src/team/team-types.ts"

function makeState(overrides: Partial<TeamState> = {}): TeamState {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: "2026-07-31T00:00:00.000Z",
    runs: [],
    ...overrides,
  }
}

describe("team state hygiene", () => {
  it("reopens a closed run when a non-terminal worker is still persisted", () => {
    const state = makeState({
      activeRunID: "run-1",
      runs: [
        {
          id: "run-1",
          title: "stale closed",
          parentSessionID: "parent-1",
          status: "completed",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
          notificationPending: false,
          jobs: [
            {
              id: "job-1",
              title: "live",
              objective: "reconcile",
              agent: "ctf-web",
              routeId: "R1",
              concurrency: "independent",
              sessionID: "worker-1",
              status: "running",
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
            },
          ],
        },
      ],
    })

    const report = normalizeTeamState(state)
    expect(report.changed).toBe(true)
    expect(state.runs[0].status).toBe("running")
    expect(state.activeRunID).toBe("run-1")
  })

  it("repairs completed jobs that never promoted the run to synthesis", () => {
    const state = makeState({
      activeRunID: "run-1",
      runs: [
        {
          id: "run-1",
          title: "wave",
          parentSessionID: "parent-1",
          status: "running",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
          notificationPending: false,
          jobs: [
            {
              id: "job-1",
              title: "task",
              objective: "objective",
              agent: "ctf-web",
              routeId: "R1",
              concurrency: "independent",
              status: "completed",
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
            },
          ],
        },
      ],
    })

    const report = normalizeTeamState(state)

    expect(report.changed).toBe(true)
    expect(state.runs[0].status).toBe("ready_for_synthesis")
    expect(state.runs[0].notificationPending).toBe(true)
    expect(state.activeRunID).toBe("run-1")
  })

  it("clears stale activeRunID and notification metadata for closed or active runs", () => {
    const state = makeState({
      activeRunID: "done-run",
      runs: [
        {
          id: "done-run",
          title: "done",
          parentSessionID: "parent-1",
          status: "completed",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
          notificationPending: true,
          jobs: [
            {
              id: "job-1",
              title: "task",
              objective: "objective",
              agent: "ctf-web",
              routeId: "R1",
              concurrency: "independent",
              status: "completed",
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
            },
          ],
        },
        {
          id: "live-run",
          title: "live",
          parentSessionID: "parent-2",
          status: "running",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
          notificationPending: true,
          notificationSentAt: "2026-07-31T00:01:00.000Z",
          notificationError: "old error",
          jobs: [
            {
              id: "job-2",
              title: "task",
              objective: "objective",
              agent: "ctf-pwn",
              routeId: "R2",
              concurrency: "independent",
              status: "running",
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
            },
          ],
        },
      ],
    })

    const report = normalizeTeamState(state)

    expect(report.changed).toBe(true)
    expect(state.activeRunID).toBe("live-run")
    expect(state.runs[0].notificationPending).toBe(false)
    expect(state.runs[1].notificationPending).toBe(false)
    expect(state.runs[1].notificationSentAt).toBeUndefined()
    expect(state.runs[1].notificationError).toBeUndefined()
  })
})

describe("team lock diagnostics", () => {
  it("reports active and released sentinels in the owning worktree", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-lock-diagnostics-"))
    const file = path.join(directory, "state.json")
    let release!: () => void
    const held = withFileLock(file, async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })

    for (let attempt = 0; attempt < 50; attempt++) {
      const report = await inspectTeamLockState(directory)
      if (report.activeLockCount === 1) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const active = await inspectTeamLockState(directory)
    expect(active.path).toBe(path.join(directory, ".ctf-locks"))
    expect(active.present).toBe(true)
    expect(active.sentinelCount).toBe(1)
    expect(active.activeLockCount).toBe(1)
    expect(active.staleLockCount).toBe(0)
    expect(active.entries[0]?.sentinel).toBe(resolveFileLockPaths(file).sentinel)

    release()
    await held
    const released = await inspectTeamLockState(directory)
    expect(released.sentinelCount).toBe(1)
    expect(released.activeLockCount).toBe(0)
    expect(released.staleLockCount).toBe(0)
    expect(released.entries[0]?.status).toBe("released")

    await rm(directory, { recursive: true, force: true })
  })
})
