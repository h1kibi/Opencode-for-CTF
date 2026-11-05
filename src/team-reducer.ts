import {
  now,
  type TeamJob,
  type TeamJobStatus,
  type TeamProbe,
  type TeamRun,
  type TeamRunStatus,
} from "./team/team-types.ts"

const TERMINAL_JOB_STATES = new Set<TeamJobStatus>([
  "completed",
  "failed",
  "cancelled",
  "cancel_failed",
  "interrupted",
  "orphaned",
])

const JOB_TRANSITIONS: Record<TeamJobStatus, readonly TeamJobStatus[]> = {
  queued: ["starting", "cancelled", "cancel_failed", "failed"],
  starting: ["running", "failed", "cancelled", "cancel_failed"],
  running: ["retrying", "completed", "failed", "cancelled", "cancel_failed", "interrupted"],
  retrying: ["running", "completed", "failed", "cancelled", "cancel_failed", "interrupted"],
  completed: [],
  failed: ["retrying"],
  // A follow-up abort can discover that a replacement session was already
  // promoted when cancellation was persisted. Keep the job fail-closed.
  cancelled: ["cancel_failed"],
  cancel_failed: ["retrying", "cancelled"],
  interrupted: ["retrying"],
  orphaned: [],
}

export function isTerminalTeamJob(status: TeamJobStatus): boolean {
  return TERMINAL_JOB_STATES.has(status)
}

export function canTransitionTeamJob(from: TeamJobStatus, to: TeamJobStatus): boolean {
  return from === to || JOB_TRANSITIONS[from].includes(to)
}

export type TeamJobTransitionResult<T> = {
  ok: boolean
  previous: T
  current: T
  reason: string
}

/**
 * Transition a team job with diagnostics. Never silently returns the original
 * job on an illegal transition — callers must be able to tell the difference
 * between "already there" and "this event is invalid".
 */
export function transitionTeamJobChecked<T extends { status: TeamJobStatus; error?: string }>(
  job: T,
  next: TeamJobStatus,
  error?: string,
): TeamJobTransitionResult<T> {
  const previous = { ...job } as T
  if (!canTransitionTeamJob(job.status, next)) {
    return {
      ok: false,
      previous,
      current: job,
      reason: `illegal job transition ${job.status} -> ${next}`,
    }
  }
  job.status = next
  if (error !== undefined) job.error = error
  return { ok: true, previous, current: job, reason: `transitioned ${previous.status} -> ${next}` }
}

/**
 * Best-effort mutating variant: logs an illegal transition and returns the
 * job. Callers that must branch on failure use transitionTeamJobChecked.
 */
export function transitionTeamJob<T extends { status: TeamJobStatus; error?: string }>(
  job: T,
  next: TeamJobStatus,
  error?: string,
): T {
  const result = transitionTeamJobChecked(job, next, error)
  if (!result.ok) {
    console.warn(`[team-reducer] ${result.reason} (silent failure prevented; prefer transitionTeamJobChecked)`)
  }
  return job
}

export function deriveTeamRunStatus(jobs: Array<{ status: TeamJobStatus }>, current?: TeamRunStatus): TeamRunStatus {
  if (current === "completed" || current === "cancelled") return current
  if (jobs.some((job) => job.status === "cancel_failed")) return "degraded"
  if (jobs.some((job) => !isTerminalTeamJob(job.status))) {
    return jobs.some((job) => job.status === "queued" || job.status === "starting") ? "dispatching" : "running"
  }
  // Every worker was cancelled and none completed: that is a cancellation, not
  // a degraded run. The state normalizer relied on this rule before the
  // derivation was unified, so keeping it here preserves the behavior both
  // call sites had.
  if (jobs.length > 0 && jobs.every((job) => job.status === "cancelled")) return "cancelled"
  return jobs.some((job) => job.status === "completed") ? "ready_for_synthesis" : "degraded"
}

const PROBE_STATUS_BY_JOB: Partial<Record<TeamJobStatus, TeamProbe["status"]>> = {
  queued: "queued",
  starting: "queued",
  running: "running",
  retrying: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  cancel_failed: "failed",
  interrupted: "failed",
  orphaned: "failed",
}

export function syncProbeStatus(run: TeamRun, job: TeamJob, status = job.status): void {
  const probe = run.probes.find((candidate) => candidate.id === job.probeId)
  if (!probe || (status === "completed" && probe.status === "blocked")) return
  const next = PROBE_STATUS_BY_JOB[status]
  if (!next) return
  probe.status = next
  probe.updatedAt = now()
}

export function refreshTeamRunStatus(run: TeamRun): void {
  run.updatedAt = now()
  if (run.status !== "completed" && run.status !== "cancelled" && run.status !== "cancelling") {
    run.status = deriveTeamRunStatus(run.jobs, run.status)
  }
  for (const job of run.jobs) syncProbeStatus(run, job)
  if (run.status === "ready_for_synthesis" || run.status === "degraded") run.notificationPending = true
}

export function clearRetryReservation(job: TeamJob): void {
  job.retryPending = false
  job.retrySessionID = undefined
}

export type TeamRetryFence = {
  runID: string
  jobID: string
  oldSessionID: string
  expectedOwnerToken?: string
  retryOwnerToken: string
  attempt: number
}

function matchesTeamRetryFence(run: TeamRun, job: TeamJob, fence: TeamRetryFence): boolean {
  return (
    run.id === fence.runID &&
    job.id === fence.jobID &&
    job.sessionID === fence.oldSessionID &&
    job.ownerToken === fence.retryOwnerToken &&
    job.status === "retrying"
  )
}

export function hasTeamRetryReservation(run: TeamRun, job: TeamJob, fence: TeamRetryFence): boolean {
  return matchesTeamRetryFence(run, job, fence) && job.retryPending === true
}

export function reserveTeamRetry(run: TeamRun, job: TeamJob, fence: TeamRetryFence): boolean {
  if (
    run.id !== fence.runID ||
    job.id !== fence.jobID ||
    job.sessionID !== fence.oldSessionID ||
    job.ownerToken !== fence.expectedOwnerToken ||
    job.status !== "running"
  ) {
    return false
  }
  transitionTeamJob(job, "retrying", `Deadline retry attempt ${fence.attempt} reserved.`)
  job.ownerToken = fence.retryOwnerToken
  job.retryPending = true
  job.attempt = fence.attempt
  job.retryAttempt = fence.attempt
  job.deadlineAt = undefined
  job.lastHeartbeatAt = undefined
  job.updatedAt = now()
  refreshTeamRunStatus(run)
  return true
}

export function recordTeamRetrySession(
  run: TeamRun,
  job: TeamJob,
  fence: TeamRetryFence,
  replacementSessionID: string,
): boolean {
  if (!matchesTeamRetryFence(run, job, fence) || !job.retryPending) return false
  job.retrySessionID = replacementSessionID
  job.updatedAt = now()
  return true
}

export type TeamRetryFailure = {
  status: Extract<TeamJob["status"], "failed" | "cancel_failed">
  message: string
  replacementSessionID?: string
  oldSessionAbortSucceeded: boolean
}

export function failTeamRetry(run: TeamRun, job: TeamJob, fence: TeamRetryFence, failure: TeamRetryFailure): boolean {
  if (!matchesTeamRetryFence(run, job, fence)) return false
  job.attempt = fence.attempt
  job.abortRequestedAt = now()
  if (failure.oldSessionAbortSucceeded) job.abortSucceededAt = now()
  job.deadlineAt = undefined
  job.lastHeartbeatAt = undefined
  clearRetryReservation(job)
  if (failure.replacementSessionID) job.sessionID = failure.replacementSessionID
  transitionTeamJob(job, failure.status, failure.message)
  job.finishedAt = now()
  job.updatedAt = now()
  refreshTeamRunStatus(run)
  return true
}

export function commitTeamRetry(
  run: TeamRun,
  job: TeamJob,
  fence: TeamRetryFence,
  replacementSessionID: string,
  startedAt: string,
  deadlineAt: string,
): boolean {
  if (!matchesTeamRetryFence(run, job, fence)) return false
  transitionTeamJob(job, "retrying", `Deadline retry attempt ${fence.attempt} started.`)
  transitionTeamJob(job, "running")
  job.sessionID = replacementSessionID
  job.attempt = fence.attempt
  job.retryAttempt = fence.attempt
  job.retryPending = false
  job.retrySessionID = undefined
  job.ownerToken = fence.retryOwnerToken
  job.startedAt = startedAt
  job.deadlineAt = deadlineAt
  job.lastHeartbeatAt = startedAt
  job.abortRequestedAt = now()
  job.abortSucceededAt = now()
  job.finishedAt = undefined
  job.error = undefined
  job.updatedAt = startedAt
  refreshTeamRunStatus(run)
  return true
}

export function recoverPendingTeamRetry(run: TeamRun, job: TeamJob, abortError?: string): boolean {
  if (!job.retryPending) return false
  clearRetryReservation(job)
  job.deadlineAt = undefined
  job.lastHeartbeatAt = undefined
  job.finishedAt = now()
  job.updatedAt = now()
  const message = abortError
    ? `Retry recovery after runtime restart failed to abort the pending replacement: ${abortError}`
    : "Retry was interrupted by runtime restart; pending worker was aborted."
  transitionTeamJob(job, abortError ? "cancel_failed" : "failed", message)
  refreshTeamRunStatus(run)
  return true
}

export type TeamCancellationResult = {
  abortFailed: boolean
  followUpSessionIDs: string[]
}

export function applyTeamCancellation(
  run: TeamRun,
  job: TeamJob,
  outcome: { hasAbortTarget: boolean; error?: string },
  options: { reason?: string; forceOrphan?: boolean; abortTargetSessionID?: string } = {},
): TeamCancellationResult {
  const orphaned = job.status === "orphaned" || job.orphaned?.state === "orphaned"
  const followUpSessionIDs = [job.sessionID, job.retrySessionID].filter(
    (sessionID): sessionID is string => Boolean(sessionID) && sessionID !== options.abortTargetSessionID,
  )
  let abortFailed = false

  if (!outcome.hasAbortTarget) {
    if (options.forceOrphan && orphaned) {
      job.status = "cancelled"
      job.error = `${options.reason}; forced orphan cancellation`
      if (job.orphaned) job.orphaned.recoverable = false
    } else {
      transitionTeamJob(job, "cancelled", options.reason)
    }
  } else if (outcome.error) {
    if (options.forceOrphan && orphaned) {
      job.status = "cancelled"
      job.error = `${options.reason}; forced orphan cancellation; abort failed: ${outcome.error}`
      if (job.orphaned) job.orphaned.recoverable = false
    } else {
      transitionTeamJob(job, "cancel_failed", `${options.reason}; abort failed: ${outcome.error}`)
      abortFailed = true
    }
  } else if (orphaned) {
    job.status = "cancelled"
    job.error = options.reason
    if (job.orphaned) job.orphaned.recoverable = false
  } else {
    transitionTeamJob(job, "cancelled", options.reason)
  }

  clearRetryReservation(job)
  job.finishedAt = now()
  job.updatedAt = now()
  syncProbeStatus(run, job, job.status)
  return { abortFailed, followUpSessionIDs }
}

export function finalizeTeamJob(run: TeamRun, job: TeamJob): void {
  job.finishedAt = now()
  job.updatedAt = now()
  refreshTeamRunStatus(run)
}
