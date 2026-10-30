import { describe, expect, it } from "vitest"
import { hasOpenTeamWorker, probeSessionPresence } from "../src/team/session-liveness.ts"

describe("session liveness", () => {
  it("fails closed when the SDK has no session presence surface", async () => {
    await expect(probeSessionPresence({}, "C:/work/ctf", "parent-1")).resolves.toBe("unknown")
  })
})

describe("open Team workers", () => {
  const baseRun: Omit<import("../src/team/team-types.ts").TeamRun, "jobs"> = {
    id: "run-1",
    title: "test",
    parentSessionID: "parent-1",
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    probes: [],
    notificationPending: false,
  }

  function job(
    status: import("../src/team/team-types.ts").TeamJobStatus,
    extras: Partial<import("../src/team/team-types.ts").TeamJob> = {},
  ): import("../src/team/team-types.ts").TeamJob {
    return {
      id: "job-1",
      probeId: "probe-1",
      agent: "ctf-web",
      status,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...extras,
    }
  }

  it("accepts only fully terminal jobs", () => {
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [job("completed"), job("failed")] })).toBe(false)
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [job("cancelled"), job("interrupted")] })).toBe(false)
  })

  it("blocks adoption for active, retrying, or uncertain jobs", () => {
    for (const status of ["queued", "starting", "running", "retrying"] as const) {
      expect(hasOpenTeamWorker({ ...baseRun, jobs: [job(status)] })).toBe(true)
    }
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [job("failed", { retryPending: true })] })).toBe(true)
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [job("failed", { retrySessionID: "retry-1" })] })).toBe(true)
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [job("cancel_failed")] })).toBe(false)
  })
})
