import { mkdtempSync } from "node:fs"
import { readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveFileLockPaths, withFileLock } from "../src/file-lock.ts"
import {
  inspectTeamLockState,
  normalizePersistedTeamState,
  normalizeTeamState,
  parseTeamState,
  quarantineTeamState,
  readTeamState,
} from "../src/team/team-state.ts"
import type { TeamState } from "../src/team/team-types.ts"
import { deriveTeamRunStatus } from "../src/team-reducer.ts"

function makeState(overrides: Partial<TeamState> = {}): TeamState {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: "2026-07-31T00:00:00.000Z",
    runs: [],
    ...overrides,
  }
}

describe("team state recovery", () => {
  it("keeps unknown agents readable and marks the job orphaned", () => {
    const state = parseTeamState({
      schemaVersion: 1,
      revision: 3,
      updatedAt: "2026-07-31T00:00:00.000Z",
      runs: [
        {
          id: "run-orphan",
          title: "old wave",
          parentSessionID: "parent-1",
          status: "running",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
          notificationPending: false,
          jobs: [
            {
              id: "job-old",
              title: "old worker",
              objective: "recover",
              agent: "ctf-web-removed",
              routeId: "R1",
              concurrency: "independent",
              sessionID: "worker-old",
              status: "running",
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
            },
          ],
        },
      ],
    })
    const job = state.runs[0].jobs[0]
    expect(job.status).toBe("orphaned")
    expect(job.orphaned).toMatchObject({
      state: "orphaned",
      reason: "unknown_agent",
      originalAgent: "ctf-web-removed",
      recoverable: true,
    })
    expect(job.originalAgent).toBe("ctf-web-removed")
  })

  it("persists the orphan marker when normalization is requested", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-orphan-persist-"))
    try {
      await writeFile(
        path.join(directory, ".ctf-team.json"),
        JSON.stringify({
          schemaVersion: 1,
          revision: 0,
          updatedAt: "2026-07-31T00:00:00.000Z",
          runs: [
            {
              id: "run-orphan-persist",
              title: "old wave",
              parentSessionID: "parent-1",
              status: "running",
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
              notificationPending: false,
              jobs: [
                {
                  id: "job-old",
                  title: "old job",
                  objective: "inspect",
                  agent: "ctf-removed",
                  routeId: "R1",
                  concurrency: "independent",
                  sessionID: "worker-old",
                  status: "running",
                  createdAt: "2026-07-31T00:00:00.000Z",
                  updatedAt: "2026-07-31T00:00:00.000Z",
                },
              ],
            },
          ],
          activeRunID: "run-orphan-persist",
        }),
        "utf8",
      )
      const normalized = await normalizePersistedTeamState(directory)
      expect(normalized.repairs.join("\n")).toContain("unknown agent ctf-removed marked orphaned")
      const persisted = JSON.parse(await readFile(path.join(directory, ".ctf-team.json"), "utf8"))
      expect(persisted.runs[0].jobs[0].orphaned).toMatchObject({
        state: "orphaned",
        reason: "unknown_agent",
        recoverable: true,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("quarantines the original state and leaves a dispatchable fresh state", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-repair-"))
    try {
      await writeFile(path.join(directory, ".ctf-team.json"), "{ invalid", "utf8")
      const result = await quarantineTeamState(directory, "test repair")
      expect(result.quarantined).toBe(true)
      expect(result.destination).toBeTruthy()
      expect(await readTeamState(directory)).toMatchObject({ schemaVersion: 1, runs: [] })
      expect(await readFile(result.destination!, "utf8")).toBe("{ invalid")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

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

describe("team state fact and intent validation", () => {
  const baseRun = {
    id: "run-1",
    title: "validation",
    parentSessionID: "parent-1",
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    jobs: [
      {
        id: "job-1",
        title: "pwn",
        objective: "test",
        agent: "ctf-pwn",
        routeId: "R1",
        concurrency: "independent",
        intentId: "intent-1",
        ownerToken: "claim-token",
        status: "running",
        sessionID: "worker-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  }
  const write = async (directory: string, run: Record<string, unknown>) => {
    await writeFile(
      path.join(directory, ".ctf-team.json"),
      JSON.stringify({ schemaVersion: 1, revision: 1, updatedAt: new Date().toISOString(), runs: [run] }),
      "utf8",
    )
  }

  it("accepts a well-formed fact and intent ledger", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-valid-ledger-"))
    try {
      await write(directory, {
        ...baseRun,
        facts: [
          {
            id: "fact-1",
            runId: "run-1",
            routeId: "R1",
            sourceJobId: "job-1",
            sourceSessionId: "worker-1",
            kind: "observation",
            statement: "NX enabled",
            evidence: [{ type: "command", value: "checksec ./chall" }],
            confidence: "observed",
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        intents: [
          {
            id: "intent-1",
            runId: "run-1",
            routeId: "R1",
            title: "confirm control",
            objective: "confirm RIP control",
            basedOnFactIds: ["fact-1"],
            stopCondition: "confirmed or ruled out",
            concurrency: "exclusive",
            requiredCapabilities: [],
            status: "claimed",
            claimedBy: "job-1",
            claimToken: "claim-token",
            claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            attempts: 1,
            maxAttempts: 2,
            createdBy: "expert",
            updatedAt: new Date().toISOString(),
          },
        ],
      })
      const state = await readTeamState(directory)
      expect(state.runs[0].facts).toHaveLength(1)
      expect(state.runs[0].intents).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("fails closed on a malformed fact or intent ledger", async () => {
    const cases: Array<Record<string, unknown>> = [
      { intents: "not-an-array" },
      { facts: { id: "fact-1" } },
      { intents: [{ id: "intent-1", status: "bogus", routeId: "R1", concurrency: "exclusive" }] },
      { intents: [{ id: "intent-1", status: "open", routeId: "R9", concurrency: "exclusive" }] },
      { facts: [{ id: "fact-1", status: "pending", statement: "s", evidence: "not-an-array" }] },
      { facts: [{ id: "fact-1", status: "nope", statement: "s", evidence: [] }] },
      { intents: [{ id: "intent-1", status: "open", routeId: "R1", concurrency: "exclusive", claimedBy: "ghost" }] },
      {
        facts: [
          {
            id: "fact-1",
            runId: "run-1",
            routeId: "R1",
            sourceJobId: "job-1",
            sourceSessionId: "worker-1",
            kind: "bogus",
            statement: "s",
            evidence: [{ type: "command", value: "v" }],
            confidence: "observed",
            status: "pending",
          },
        ],
      },
      {
        facts: [
          {
            id: "fact-1",
            runId: "run-1",
            routeId: "R1",
            sourceJobId: "job-1",
            sourceSessionId: "worker-1",
            kind: "observation",
            statement: "s",
            evidence: [{ type: "command", value: "v" }],
            confidence: "confirmed",
            status: "pending",
          },
        ],
      },
      {
        intents: [
          {
            id: "intent-1",
            status: "claimed",
            routeId: "R1",
            title: "t",
            objective: "o",
            basedOnFactIds: [],
            requiredCapabilities: [],
            concurrency: "exclusive",
            attempts: 1,
            maxAttempts: 2,
            createdBy: "expert",
          },
        ],
      },
      {
        intents: [
          {
            id: "intent-1",
            status: "open",
            routeId: "R1",
            title: "t",
            objective: "o",
            basedOnFactIds: ["f", "f"],
            requiredCapabilities: [],
            concurrency: "exclusive",
            attempts: 0,
            maxAttempts: 2,
            createdBy: "expert",
          },
        ],
      },
      {
        intents: [
          {
            id: "intent-1",
            runId: "run-1",
            status: "claimed",
            routeId: "R1",
            title: "t",
            objective: "o",
            basedOnFactIds: [],
            requiredCapabilities: [],
            concurrency: "exclusive",
            attempts: 1,
            maxAttempts: 2,
            createdBy: "expert",
            stopCondition: "done",
            claimedBy: "job-1",
            claimToken: "token-a",
            claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      },
      {
        intents: [
          {
            id: "intent-1",
            runId: "run-1",
            status: "claimed",
            routeId: "R1",
            title: "t",
            objective: "o",
            basedOnFactIds: [],
            requiredCapabilities: [],
            concurrency: "exclusive",
            attempts: 1,
            maxAttempts: 2,
            createdBy: "expert",
            stopCondition: "done",
            claimedBy: "job-1",
          },
        ],
      },
    ]
    const validJob = { ...baseRun.jobs[0], sessionID: "worker-1" }
    const validFact = {
      id: "fact-1",
      runId: "run-1",
      routeId: "R1",
      sourceJobId: "job-1",
      sourceSessionId: "worker-1",
      kind: "observation",
      statement: "s",
      evidence: [{ type: "command", value: "v" }],
      confidence: "observed",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const validIntent = {
      id: "intent-1",
      runId: "run-1",
      routeId: "R1",
      title: "t",
      objective: "o",
      basedOnFactIds: ["fact-1"],
      requiredCapabilities: [],
      concurrency: "exclusive",
      status: "open",
      attempts: 0,
      maxAttempts: 2,
      createdBy: "expert",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const duplicateCases = [
      { facts: [validFact, { ...validFact }], intents: [validIntent] },
      { facts: [validFact], intents: [validIntent, { ...validIntent }] },
    ]
    for (const ledger of duplicateCases) {
      const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-duplicate-ledger-"))
      try {
        await write(directory, { ...baseRun, jobs: [validJob], ...ledger })
        await expect(readTeamState(directory)).rejects.toThrow(/duplicate (fact|intent) id/)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
    for (const malformed of cases) {
      const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-bad-ledger-"))
      try {
        await write(directory, { ...baseRun, ...malformed })
        await expect(readTeamState(directory), JSON.stringify(malformed).slice(0, 60)).rejects.toThrow(
          /Invalid CTF team state/,
        )
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  })

  it("derives cancelled for a run whose workers were all cancelled", () => {
    expect(deriveTeamRunStatus([{ status: "cancelled" }, { status: "cancelled" }], "running")).toBe("cancelled")
  })
})
