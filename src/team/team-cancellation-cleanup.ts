import { clearRetryReservation, transitionTeamJob } from "../team-reducer.ts"
import { findRun, updateTeamState } from "./team-state.ts"
import { now, safeError } from "./team-types.ts"

const MAX_FOLLOW_UP_ABORT_PASSES = 4

export type FollowUpSession = {
  runID: string
  jobID: string
  sessionID: string
  supersedesSessionID?: string
}

export type TeamAbortClient = {
  session: {
    abort(request: { path: { id: string }; query: { directory: string } }): Promise<unknown>
  }
}

export function abortOutcomeError(result: PromiseSettledResult<unknown> | undefined): string | undefined {
  if (!result) return "abort outcome missing"
  if (result.status === "rejected") return safeError(result.reason)
  if (result.value && typeof result.value === "object" && "error" in result.value && result.value.error) {
    return safeError(result.value.error)
  }
  return undefined
}

function dedupeFollowUps(items: FollowUpSession[]): FollowUpSession[] {
  return Array.from(new Map(items.map((item) => [`${item.runID}:${item.jobID}:${item.sessionID}`, item])).values())
}

export async function abortFollowUpSessions(
  client: TeamAbortClient,
  directory: string,
  sessions: FollowUpSession[],
  reason: string,
): Promise<void> {
  let pending = dedupeFollowUps(sessions)

  for (let pass = 0; pending.length && pass < MAX_FOLLOW_UP_ABORT_PASSES; pass++) {
    const currentPass = pending
    const aborts = await Promise.allSettled(
      currentPass.map((item) =>
        client.session.abort({
          path: { id: item.sessionID },
          query: { directory },
        }),
      ),
    )
    const followUps: FollowUpSession[] = []
    const enqueue = (item: FollowUpSession) => followUps.push(item)

    await updateTeamState(directory, (draft) => {
      for (const [index, item] of currentPass.entries()) {
        const run = findRun(draft, item.runID)
        const job = run?.jobs.find((candidate) => candidate.id === item.jobID)
        if (!run || !job) continue

        if (job.sessionID && job.sessionID !== item.sessionID && job.sessionID !== item.supersedesSessionID) {
          enqueue({
            runID: item.runID,
            jobID: item.jobID,
            sessionID: job.sessionID,
            supersedesSessionID: item.sessionID,
          })
        }
        if (job.retrySessionID && job.retrySessionID !== item.sessionID) {
          enqueue({
            runID: item.runID,
            jobID: item.jobID,
            sessionID: job.retrySessionID,
            supersedesSessionID: job.sessionID,
          })
        }

        const abortError = abortOutcomeError(aborts[index])
        if (!abortError || (job.status !== "cancelled" && job.status !== "cancel_failed")) continue
        transitionTeamJob(job, "cancel_failed", `${reason}; replacement abort failed: ${abortError}`)
        clearRetryReservation(job)
        job.finishedAt = now()
        job.updatedAt = now()
        run.status = "degraded"
        run.notificationPending = true
        run.updatedAt = now()
        draft.activeRunID = run.id
      }
    })
    pending = dedupeFollowUps(followUps)
  }

  if (!pending.length) return
  await updateTeamState(directory, (draft) => {
    for (const item of pending) {
      const run = findRun(draft, item.runID)
      const job = run?.jobs.find((candidate) => candidate.id === item.jobID)
      if (!run || !job || (job.status !== "cancelled" && job.status !== "cancel_failed")) continue
      transitionTeamJob(
        job,
        "cancel_failed",
        `${reason}; replacement abort did not converge after ${MAX_FOLLOW_UP_ABORT_PASSES} attempts`,
      )
      clearRetryReservation(job)
      job.finishedAt = now()
      job.updatedAt = now()
      run.status = "degraded"
      run.notificationPending = true
      run.updatedAt = now()
      draft.activeRunID = run.id
    }
  })
}
