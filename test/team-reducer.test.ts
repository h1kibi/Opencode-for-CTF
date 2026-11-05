import { describe, expect, it } from "vitest"
import {
  applyTeamCancellation,
  canTransitionTeamJob,
  clearRetryReservation,
  commitTeamRetry,
  deriveTeamRunStatus,
  finalizeTeamJob,
  hasTeamRetryReservation,
  isTerminalTeamJob,
  recoverPendingTeamRetry,
  recordTeamRetrySession,
  refreshTeamRunStatus,
  reserveTeamRetry,
  syncProbeStatus,
  transitionTeamJob,
  transitionTeamJobChecked,
} from "../src/team-reducer.ts"
import { prepareOrphanJobAdoption, rebindTeamParent } from "../src/team-adoption-reducer.ts"
import { isTerminalJob } from "../src/team/team-state.ts"
import type { TeamJob, TeamProbe, TeamRun } from "../src/team/team-types.ts"

const makeJob = (status: TeamJob["status"]): TeamJob => ({
  id: "job-1",
  probeId: "p1",
  agent: "ctf-web",
  status,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const makeProbe = (status: TeamProbe["status"]): TeamProbe => ({
  id: "p1",
  title: "Probe",
  objective: "Verify lifecycle state",
  agent: "ctf-web",
  routeId: "R1",
  concurrency: "independent",
  status,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const makeRun = (job: TeamJob, probe: TeamProbe): TeamRun => ({
  id: "run-1",
  title: "Lifecycle test",
  parentSessionID: "session-1",
  status: "running",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  probes: [probe],
  jobs: [job],
  notificationPending: false,
})

describe("team reducer", () => {
  it("prevents terminal jobs from being overwritten by stale events", () => {
    expect(isTerminalTeamJob("cancel_failed")).toBe(true)
    expect(canTransitionTeamJob("completed", "running")).toBe(false)
    const job = { status: "completed" as const }
    transitionTeamJob(job, "running")
    expect(job.status).toBe("completed")
  })

  it("keeps the state module terminal predicate as a compatibility re-export", () => {
    for (const status of ["completed", "failed", "cancelled", "cancel_failed", "interrupted", "orphaned"] as const) {
      expect(isTerminalJob(status)).toBe(isTerminalTeamJob(status))
    }
    expect(isTerminalJob("running")).toBe(false)
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

  it("keeps the best-effort wrapper contract and preserves illegal state", () => {
    const job = { status: "completed" as const }
    const out = transitionTeamJob(job, "running")
    expect(out).toBe(job)
    expect(job.status).toBe("completed")
  })

  it("syncs job state without overwriting a blocked probe", () => {
    const job = makeJob("completed")
    const run = makeRun(job, makeProbe("blocked"))
    syncProbeStatus(run, job)
    expect(run.probes[0].status).toBe("blocked")
  })

  it("marks cancel failures degraded and all-cancelled runs cancelled", () => {
    const degraded = makeRun(makeJob("cancel_failed"), makeProbe("queued"))
    refreshTeamRunStatus(degraded)
    expect(degraded.status).toBe("degraded")
    expect(degraded.notificationPending).toBe(true)

    const cancelled = makeRun(makeJob("cancelled"), makeProbe("queued"))
    refreshTeamRunStatus(cancelled)
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.probes[0].status).toBe("cancelled")
  })

  it("clears retry fencing fields together", () => {
    const job = Object.assign(makeJob("retrying"), { retryPending: true, retrySessionID: "replacement" })
    clearRetryReservation(job)
    expect(job).toMatchObject({ retryPending: false, retrySessionID: undefined })
  })

  it("keeps retry replacement writes fenced to the reserved owner", () => {
    const job = Object.assign(makeJob("running"), { sessionID: "worker-old", ownerToken: "owner-old" })
    const run = makeRun(job, makeProbe("running"))
    const fence = {
      runID: run.id,
      jobID: job.id,
      oldSessionID: "worker-old",
      expectedOwnerToken: "owner-old",
      retryOwnerToken: "owner-retry",
      attempt: 1,
    }

    expect(reserveTeamRetry(run, job, fence)).toBe(true)
    expect(hasTeamRetryReservation(run, job, fence)).toBe(true)
    expect(recordTeamRetrySession(run, job, fence, "worker-replacement")).toBe(true)
    expect(recordTeamRetrySession(run, job, { ...fence, retryOwnerToken: "stale-owner" }, "stale-replacement")).toBe(
      false,
    )
    expect(
      commitTeamRetry(
        run,
        job,
        { ...fence, retryOwnerToken: "stale-owner" },
        "stale-replacement",
        "2026-01-01T00:00:01.000Z",
        "2026-01-01T00:01:01.000Z",
      ),
    ).toBe(false)
    expect(job.status).toBe("retrying")
    expect(job.retrySessionID).toBe("worker-replacement")
    expect(
      commitTeamRetry(run, job, fence, "worker-replacement", "2026-01-01T00:00:01.000Z", "2026-01-01T00:01:01.000Z"),
    ).toBe(true)
    expect(job).toMatchObject({
      status: "running",
      sessionID: "worker-replacement",
      retryPending: false,
      retrySessionID: undefined,
    })
    expect(run.probes[0].status).toBe("running")
  })

  it("fails pending retries closed during runtime recovery", () => {
    const job = Object.assign(makeJob("retrying"), { retryPending: true, retrySessionID: "worker-replacement" })
    const run = makeRun(job, makeProbe("running"))

    expect(recoverPendingTeamRetry(run, job, "replacement unavailable")).toBe(true)
    expect(job).toMatchObject({ status: "cancel_failed", retryPending: false, retrySessionID: undefined })
    expect(job.error).toContain("failed to abort")
    expect(run.status).toBe("degraded")
    expect(recoverPendingTeamRetry(run, job)).toBe(false)
  })

  it("moves an orphan job and its probe through bounded adoption state", () => {
    const job = Object.assign(makeJob("orphaned"), {
      sessionID: "worker-old",
      originalAgent: "ctf-unknown",
      orphaned: { state: "orphaned" as const, reason: "unknown_agent" as const, recoverable: true },
    })
    const run = makeRun(job, makeProbe("failed"))
    const adopted = prepareOrphanJobAdoption(run, job, {
      replacementSessionID: "worker-new",
      replacementAgent: "ctf-pwn",
      adoptedBySessionID: "parent-new",
      reason: "replace stale worker",
      ownerToken: "owner-new",
      previousSessionID: "worker-old",
      at: "2026-01-01T00:00:00.000Z",
    })

    expect(adopted).toBe(true)
    expect(run).toMatchObject({ parentSessionID: "parent-new", status: "dispatching", notificationPending: false })
    expect(job).toMatchObject({
      agent: "ctf-pwn",
      sessionID: "worker-new",
      status: "starting",
      ownerToken: "owner-new",
      orphaned: undefined,
    })
    expect(run.probes[0]).toMatchObject({ agent: "ctf-pwn", status: "queued" })
    expect(job.adoptionHistory?.[0]).toMatchObject({
      originalAgent: "ctf-unknown",
      adoptedAgent: "ctf-pwn",
      previousSessionID: "worker-old",
    })
  })

  it("rebinds only the expected parent and bounds parent adoption history", () => {
    const run = makeRun(makeJob("completed"), makeProbe("completed"))
    run.status = "ready_for_synthesis"
    for (let index = 0; index < 10; index++) {
      expect(
        rebindTeamParent(run, {
          previousParentSessionID: index === 0 ? "session-1" : `parent-${index - 1}`,
          adoptedBySessionID: `parent-${index}`,
          reason: `rebind-${index}`,
        }),
      ).toBeDefined()
    }
    expect(run.parentSessionID).toBe("parent-9")
    expect(run.adoptionHistory).toHaveLength(8)
    expect(run.notificationPending).toBe(true)
    expect(
      rebindTeamParent(run, {
        previousParentSessionID: "stale-parent",
        adoptedBySessionID: "ignored",
        reason: "stale",
      }),
    ).toBeUndefined()
    expect(run.parentSessionID).toBe("parent-9")
  })

  it("finalizes a failed job and updates its run projection", () => {
    const job = makeJob("failed")
    const run = makeRun(job, makeProbe("running"))
    finalizeTeamJob(run, job)
    expect(job.finishedAt).toBeDefined()
    expect(job.updatedAt).toBeDefined()
    expect(run.status).toBe("degraded")
    expect(run.probes[0].status).toBe("failed")
  })

  it("applies successful and failed cancellation outcomes", () => {
    const cancelledJob = makeJob("running")
    cancelledJob.sessionID = "worker-1"
    const cancelledRun = makeRun(cancelledJob, makeProbe("running"))
    const success = applyTeamCancellation(cancelledRun, cancelledJob, { hasAbortTarget: true }, { reason: "stop" })
    expect(success.abortFailed).toBe(false)
    expect(cancelledJob.status).toBe("cancelled")
    expect(cancelledRun.probes[0].status).toBe("cancelled")

    const failedJob = makeJob("running")
    failedJob.sessionID = "worker-2"
    const failedRun = makeRun(failedJob, makeProbe("running"))
    const failure = applyTeamCancellation(
      failedRun,
      failedJob,
      { hasAbortTarget: true, error: "session unavailable" },
      { reason: "stop" },
    )
    expect(failure.abortFailed).toBe(true)
    expect(failedJob.status).toBe("cancel_failed")
    expect(failedRun.probes[0].status).toBe("failed")
  })

  it("force-cancels an orphan without an abort target", () => {
    const job = Object.assign(makeJob("orphaned"), {
      orphaned: { state: "orphaned" as const, reason: "missing_session" as const, recoverable: true },
    })
    const run = makeRun(job, makeProbe("failed"))
    const result = applyTeamCancellation(run, job, { hasAbortTarget: false }, { reason: "cleanup", forceOrphan: true })
    expect(result.abortFailed).toBe(false)
    expect(job.status).toBe("cancelled")
    expect(job.orphaned?.recoverable).toBe(false)
  })
})
