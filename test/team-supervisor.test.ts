import { describe, expect, it } from "vitest"
import {
  computeJobDeadlineAt,
  evaluateJobDeadline,
  nextWorkerJobStatus,
  type DeadlineVerdict,
} from "../src/team/team-runtime-core.ts"

type JobShape = { status: "running" | "queued" | "interrupted" | "failed"; deadlineAt?: string; attempt?: number }

const NOW = Date.parse("2026-08-01T12:00:00.000Z")
const PAST = new Date(NOW - 60_000).toISOString()
const FUTURE = new Date(NOW + 60_000).toISOString()

function verdict(verdict: DeadlineVerdict) {
  return verdict
}

describe("evaluateJobDeadline (team supervisor)", () => {
  it("ignores non-running jobs", () => {
    expect(verdict(evaluateJobDeadline({ status: "queued", deadlineAt: PAST, attempt: 0 }, NOW, 2))).toEqual({
      action: "none",
    })
    expect(verdict(evaluateJobDeadline({ status: "interrupted", deadlineAt: PAST, attempt: 0 }, NOW, 2))).toEqual({
      action: "none",
    })
    expect(verdict(evaluateJobDeadline({ status: "failed", deadlineAt: PAST, attempt: 0 }, NOW, 2))).toEqual({
      action: "none",
    })
  })

  it("ignores jobs without a deadline", () => {
    expect(verdict(evaluateJobDeadline({ status: "running", attempt: 0 }, NOW, 2))).toEqual({ action: "none" })
  })

  it("ignores running jobs before the deadline", () => {
    expect(verdict(evaluateJobDeadline({ status: "running", deadlineAt: FUTURE, attempt: 0 }, NOW, 2))).toEqual({
      action: "none",
    })
  })

  it("interrupts on the first deadline exceedance when the retry budget allows", () => {
    const job: JobShape = { status: "running", deadlineAt: PAST, attempt: 0 }
    expect(verdict(evaluateJobDeadline(job, NOW, 2))).toEqual({ action: "interrupt", attempt: 1, maxAttempts: 2 })
  })

  it("fails once the retry budget is exhausted", () => {
    expect(verdict(evaluateJobDeadline({ status: "running", deadlineAt: PAST, attempt: 1 }, NOW, 2))).toEqual({
      action: "fail",
      attempt: 2,
      maxAttempts: 2,
    })
    expect(verdict(evaluateJobDeadline({ status: "running", deadlineAt: PAST, attempt: 3 }, NOW, 1))).toEqual({
      action: "fail",
      attempt: 4,
      maxAttempts: 1,
    })
  })

  it("treats unparseable deadlines as absent", () => {
    expect(verdict(evaluateJobDeadline({ status: "running", deadlineAt: "not-a-date", attempt: 0 }, NOW, 2))).toEqual({
      action: "none",
    })
  })

  it("clamps degenerate retry budgets to at least one attempt", () => {
    expect(verdict(evaluateJobDeadline({ status: "running", deadlineAt: PAST, attempt: 0 }, NOW, 0))).toEqual({
      action: "fail",
      attempt: 1,
      maxAttempts: 1,
    })
  })
})

describe("team runtime helpers", () => {
  it("starts deadlines from actual run start time, not dispatch time", () => {
    expect(computeJobDeadlineAt(90_000, NOW)).toBe("2026-08-01T12:01:30.000Z")
  })

  it("ignores idle or stale status events that would otherwise revive terminal jobs", () => {
    expect(nextWorkerJobStatus("starting", "idle")).toBeUndefined()
    expect(nextWorkerJobStatus("failed", "running")).toBeUndefined()
    expect(nextWorkerJobStatus("cancelled", "retry")).toBeUndefined()
  })

  it("allows only legal live-session transitions", () => {
    expect(nextWorkerJobStatus("starting", "running")).toBe("running")
    expect(nextWorkerJobStatus("running", "retry")).toBe("retrying")
    expect(nextWorkerJobStatus("retrying", "running")).toBe("running")
    expect(nextWorkerJobStatus("running", "error")).toBe("failed")
  })
})
