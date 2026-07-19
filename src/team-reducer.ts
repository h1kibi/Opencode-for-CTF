import type { TeamJobStatus, TeamRunStatus } from "./team-runtime.ts"

const TERMINAL_JOB_STATES = new Set<TeamJobStatus>([
  "completed",
  "failed",
  "cancelled",
  "cancel_failed",
  "interrupted",
])

const JOB_TRANSITIONS: Record<TeamJobStatus, readonly TeamJobStatus[]> = {
  queued: ["starting", "cancelled", "failed"],
  starting: ["running", "failed", "cancelled", "cancel_failed"],
  running: ["retrying", "completed", "failed", "cancelled", "cancel_failed", "interrupted"],
  retrying: ["running", "completed", "failed", "cancelled", "cancel_failed", "interrupted"],
  completed: [],
  failed: ["retrying"],
  cancelled: [],
  cancel_failed: ["retrying", "cancelled"],
  interrupted: ["retrying"],
}

export function isTerminalTeamJob(status: TeamJobStatus): boolean {
  return TERMINAL_JOB_STATES.has(status)
}

export function canTransitionTeamJob(from: TeamJobStatus, to: TeamJobStatus): boolean {
  return from === to || JOB_TRANSITIONS[from].includes(to)
}

export function transitionTeamJob<T extends { status: TeamJobStatus; error?: string }>(
  job: T,
  next: TeamJobStatus,
  error?: string,
): T {
  if (!canTransitionTeamJob(job.status, next)) {
    return job
  }
  job.status = next
  if (error !== undefined) job.error = error
  return job
}

export function deriveTeamRunStatus(
  jobs: Array<{ status: TeamJobStatus }>,
  current?: TeamRunStatus,
): TeamRunStatus {
  if (current === "completed" || current === "cancelled") return current
  if (jobs.some((job) => job.status === "cancel_failed")) return "degraded"
  if (jobs.some((job) => !isTerminalTeamJob(job.status))) {
    return jobs.some((job) => job.status === "queued" || job.status === "starting")
      ? "dispatching"
      : "running"
  }
  return jobs.some((job) => job.status === "completed") ? "ready_for_synthesis" : "degraded"
}
