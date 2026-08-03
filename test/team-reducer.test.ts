import { describe, expect, it, vi } from "vitest"
import {
  canTransitionTeamJob,
  deriveTeamRunStatus,
  isTerminalTeamJob,
  transitionTeamJob,
  transitionTeamJobChecked,
} from "../src/team-reducer.ts"

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

  it("allows cancellation cleanup to degrade an already-cancelled job", () => {
    expect(canTransitionTeamJob("cancelled", "cancel_failed")).toBe(true)
  })

  it("derives synthesis readiness only from terminal jobs", () => {
    expect(deriveTeamRunStatus([{ status: "completed" }, { status: "failed" }])).toBe("ready_for_synthesis")
    expect(deriveTeamRunStatus([{ status: "running" }])).toBe("running")
  })

  it("reports illegal transitions via the checked variant instead of failing silently", () => {
    const job = { status: "completed" as const }
    const result = transitionTeamJobChecked(job, "running")
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("illegal job transition")
    expect(result.current.status).toBe("completed")
    expect(result.previous.status).toBe("completed")
  })

  it("applies legal transitions with diagnostics", () => {
    const job = { status: "starting" as const }
    const result = transitionTeamJobChecked(job, "running")
    expect(result.ok).toBe(true)
    expect(job.status).toBe("running")
    expect(result.previous.status).toBe("starting")
    expect(result.reason).toContain("starting -> running")
  })

  it("keeps the legacy wrapper contract (returns the job) but no longer fails silently", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const job = { status: "completed" as const }
      const out = transitionTeamJob(job, "running")
      expect(out).toBe(job)
      expect(job.status).toBe("completed")
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("illegal job transition"))
    } finally {
      spy.mockRestore()
    }
  })
})
