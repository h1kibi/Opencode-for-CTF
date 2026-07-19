import { describe, expect, it } from "vitest"
import { canTransitionTeamJob, deriveTeamRunStatus, isTerminalTeamJob, transitionTeamJob } from "../src/team-reducer.ts"

describe("team reducer", () => {
  it("prevents terminal jobs from being overwritten by stale events", () => {
    expect(isTerminalTeamJob("cancel_failed")).toBe(true)
    expect(canTransitionTeamJob("completed", "running")).toBe(false)
    const job = { status: "completed" as const }
    transitionTeamJob(job, "running")
    expect(job.status).toBe("completed")
  })

  it("supports retry after a cancel failure", () => {
    expect(canTransitionTeamJob("cancel_failed", "retrying")).toBe(true)
    expect(deriveTeamRunStatus([{ status: "cancel_failed" }])).toBe("degraded")
  })

  it("derives synthesis readiness only from terminal jobs", () => {
    expect(deriveTeamRunStatus([{ status: "completed" }, { status: "failed" }])).toBe("ready_for_synthesis")
    expect(deriveTeamRunStatus([{ status: "running" }])).toBe("running")
  })
})
