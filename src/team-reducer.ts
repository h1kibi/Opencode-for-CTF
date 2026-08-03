import type { TeamJobStatus, TeamRunStatus } from "./team-runtime.ts"

const TERMINAL_JOB_STATES = new Set<TeamJobStatus>(["completed", "failed", "cancelled", "cancel_failed", "interrupted"])

const JOB_TRANSITIONS: Record<TeamJobStatus, readonly TeamJobStatus[]> = {
  queued: ["starting", "cancelled", "failed"],
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
 * Compatibility wrapper: mutates the job and returns it (legacy contract).
 * Illegal transitions now log a warning instead of failing silently, which
 * makes state-machine bugs visible in team-mode logs.
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
  return jobs.some((job) => job.status === "completed") ? "ready_for_synthesis" : "degraded"
}
