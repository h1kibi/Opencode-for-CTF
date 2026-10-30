import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveFileLockPaths, withFileLock } from "../src/file-lock.ts"
import {
  inspectTeamLockState,
  normalizePersistedTeamState,
  normalizeTeamState,
  parseTeamState,
  readTeamState,
} from "../src/team/team-state.ts"
import type { TeamState } from "../src/team/team-types.ts"
import { deriveTeamRunStatus } from "../src/team-reducer.ts"

import { makeTestWorkspace } from "./support/test-workspace.ts"
const time = "2026-07-31T00:00:00.000Z"

function probe(overrides: Record<string, unknown> = {}) {
  return {
    id: "probe-1",
    title: "inspect target",
    objective: "determine the target behavior",
    agent: "ctf-pwn",
    routeId: "R1",
    concurrency: "independent",
    status: "running",
    createdAt: time,
    updatedAt: time,
    ...overrides,
  }
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    probeId: "probe-1",
    agent: "ctf-pwn",
    status: "running",
    sessionID: "worker-1",
    createdAt: time,
    updatedAt: time,
    ...overrides,
  }
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    title: "probe wave",
    parentSessionID: "parent-1",
    status: "running",
    createdAt: time,
    updatedAt: time,
    probes: [probe()],
    jobs: [job()],
    notificationPending: false,
    ...overrides,
  }
}

function state(overrides: Record<string, unknown> = {}): TeamState {
  return {
    schemaVersion: 2,
    revision: 0,
    updatedAt: time,
    runs: [],
    ...overrides,
  } as TeamState
}

describe("team state schema v2", () => {
  it("accepts a Probe with exactly one linked Job", () => {
    const parsed = parseTeamState(state({ runs: [run()] }))

    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.runs[0].probes[0].id).toBe(parsed.runs[0].jobs[0].probeId)
  })

  it("rejects a Job that references an unknown Probe", () => {
    expect(() => parseTeamState(state({ runs: [run({ jobs: [job({ probeId: "probe-missing" })] })] }))).toThrow(
      /references an unknown probe/,
    )
  })

  it("rejects missing or duplicate Job relationships instead of accepting an incomplete run", () => {
    expect(() => parseTeamState(state({ runs: [run({ jobs: [] })] }))).toThrow(/exactly one job per probe/)
    expect(() => parseTeamState(state({ runs: [run({ jobs: [job(), job({ id: "job-2" })] })] }))).toThrow(
      /assigned to multiple jobs/,
    )
  })

  it("rejects a Probe with a malformed embedded ProbeResult", () => {
    expect(() =>
      parseTeamState(
        state({
          runs: [
            run({
              probes: [
                probe({
                  result: {
                    protocol: "ctf.team.probe.v1",
                    type: "probe_result",
                    status: "completed",
                    summary: "invalid evidence",
                    observations: [{ kind: "observation", statement: "x", evidence: "not-an-array" }],
                    artifacts: [],
                  },
                }),
              ],
            }),
          ],
        }),
      ),
    ).toThrow(/has an invalid result/)
  })

  it("orphanizes an unknown worker agent while preserving its Probe relationship", () => {
    const parsed = parseTeamState(
      state({ runs: [run({ jobs: [job({ agent: "ctf-worker-removed", status: "running" })] })] }),
    )
    const persistedJob = parsed.runs[0].jobs[0]

    expect(persistedJob.status).toBe("orphaned")
    expect(persistedJob.originalAgent).toBe("ctf-worker-removed")
    expect(persistedJob.orphaned).toMatchObject({ state: "orphaned", reason: "unknown_agent", recoverable: true })
    expect(parsed.runs[0].probes).toHaveLength(1)
    expect(persistedJob.probeId).toBe(parsed.runs[0].probes[0].id)
  })

  it("quarantines v1 state through read and normalization without migration", async () => {
    const original = JSON.stringify({
      schemaVersion: 1,
      revision: 7,
      runs: [{ id: "legacy-run", legacyField: "preserve verbatim" }],
    })
    for (const operation of ["read", "normalize"] as const) {
      const directory = makeTestWorkspace(`ctf-team-v1-${operation}`)
      try {
        await writeFile(path.join(directory, ".ctf-team.json"), original, "utf8")
        const result =
          operation === "read" ? await readTeamState(directory) : (await normalizePersistedTeamState(directory)).state
        expect(result).toMatchObject({ schemaVersion: 2, revision: 0, runs: [] })
        const quarantine = path.join(directory, ".ctf-team-quarantine")
        const names = await readdir(quarantine)
        expect(names).toHaveLength(1)
        expect(await readFile(path.join(quarantine, names[0]), "utf8")).toBe(original)
        expect(JSON.parse(await readFile(path.join(directory, ".ctf-team.json"), "utf8"))).toMatchObject({
          schemaVersion: 2,
          runs: [],
        })
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
})

describe("team state hygiene", () => {
  it("reopens a closed run when a non-terminal worker is still persisted", () => {
    const current = state({
      activeRunID: "run-1",
      runs: [run({ status: "completed" })],
    })

    const report = normalizeTeamState(current)
    expect(report.changed).toBe(true)
    expect(current.runs[0].status).toBe("running")
    expect(current.activeRunID).toBe("run-1")
  })

  it("repairs completed jobs that never promoted the run to synthesis", () => {
    const current = state({
      activeRunID: "run-1",
      runs: [run({ status: "running", jobs: [job({ status: "completed" })] })],
    })

    const report = normalizeTeamState(current)
    expect(report.changed).toBe(true)
    expect(current.runs[0].status).toBe("ready_for_synthesis")
    expect(current.runs[0].notificationPending).toBe(true)
    expect(current.activeRunID).toBe("run-1")
  })

  it("clears stale activeRunID and notification metadata for closed or active runs", () => {
    const current = state({
      activeRunID: "done-run",
      runs: [
        run({ id: "done-run", status: "completed", notificationPending: true, jobs: [job({ status: "completed" })] }),
        run({
          id: "live-run",
          status: "running",
          notificationPending: true,
          notificationSentAt: "2026-07-31T00:01:00.000Z",
          notificationError: "old error",
          probes: [probe({ id: "probe-2" })],
          jobs: [job({ id: "job-2", probeId: "probe-2", agent: "ctf-pwn" })],
        }),
      ],
    })

    const report = normalizeTeamState(current)
    expect(report.changed).toBe(true)
    expect(current.activeRunID).toBe("live-run")
    expect(current.runs[0].notificationPending).toBe(false)
    expect(current.runs[1].notificationPending).toBe(false)
    expect(current.runs[1].notificationSentAt).toBeUndefined()
    expect(current.runs[1].notificationError).toBeUndefined()
  })
})

describe("team lock diagnostics", () => {
  it("reports active and released sentinels in the owning worktree", async () => {
    const directory = makeTestWorkspace("ctf-team-lock-diagnostics")
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

describe("team run status derivation", () => {
  it("derives cancelled for a run whose workers were all cancelled", () => {
    expect(deriveTeamRunStatus([{ status: "cancelled" }, { status: "cancelled" }], "running")).toBe("cancelled")
  })
})
