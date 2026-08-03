import { canTransitionTeamJob, transitionTeamJob } from "../team-reducer.ts"
import { isTerminalJob, readTeamState, updateTeamState } from "./team-state.ts"
import { now, safeError, type TeamJob, type TeamRun } from "./team-types.ts"

const MAX_PARENT_GONE_ABORT_PASSES = 4

type AbortTarget = {
  runID: string
  jobID: string
  sessionID: string
}

function jobSessionIDs(job: TeamJob): string[] {
  return Array.from(new Set([job.retrySessionID, job.sessionID].filter((id): id is string => Boolean(id))))
}

function isOpenJob(job: TeamJob): boolean {
  return !isTerminalJob(job.status) || job.status === "cancel_failed"
}

function isClosedRun(run: TeamRun): boolean {
  return run.status === "completed" || run.status === "cancelled"
}

/**
 * Fail-safe cleanup for a parent session that disappeared before Team Mode
 * reached a terminal state. A deleted parent cannot receive synthesis or issue
 * a later cancel command, so leaving its children alive would leak work and
 * leave the persisted run falsely active.
 *
 * The helper is deliberately state-first and repeatable: every pass snapshots
 * both the current and replacement session IDs, aborts them, then persists the
 * result under the state lock. If a replacement appears while aborts are in
 * flight, another pass chases it. After the bounded pass limit the affected
 * job is marked cancel_failed rather than pretending cleanup succeeded.
 */
export async function cancelRunsForDeletedParent(client: any, directory: string, parentSessionID: string) {
  const reason = "Parent session was deleted; Team workers were aborted."
  const affectedRunIDs = new Set<string>()

  for (let pass = 0; pass < MAX_PARENT_GONE_ABORT_PASSES; pass++) {
    const snapshot = await readTeamState(directory)
    const runs = snapshot.runs.filter(
      (run) => run.parentSessionID === parentSessionID && !isClosedRun(run) && run.jobs.some(isOpenJob),
    )
    if (!runs.length) break
    for (const run of runs) affectedRunIDs.add(run.id)

    const targets: AbortTarget[] = []
    for (const run of runs) {
      for (const job of run.jobs) {
        if (!isOpenJob(job)) continue
        for (const sessionID of jobSessionIDs(job)) {
          targets.push({ runID: run.id, jobID: job.id, sessionID })
        }
      }
    }

    const aborts = await Promise.allSettled(
      targets.map(async (target) => {
        const response = await client.session.abort({
          path: { id: target.sessionID },
          query: { directory },
        })
        const error = (response as { error?: unknown } | undefined)?.error
        if (error) throw new Error(safeError(error))
      }),
    )
    const abortErrors = new Map<string, string>()
    for (const [index, result] of aborts.entries()) {
      if (result.status === "rejected") abortErrors.set(targets[index].sessionID, safeError(result.reason))
    }

    let replacementStillPresent = false
    await updateTeamState(directory, (draft) => {
      for (const run of draft.runs.filter(
        (candidate) => candidate.parentSessionID === parentSessionID && !isClosedRun(candidate),
      )) {
        let hasFailure = false
        for (const job of run.jobs) {
          if (!isOpenJob(job)) continue
          const currentSessions = jobSessionIDs(job)
          const snapshotSessions = targets
            .filter((target) => target.runID === run.id && target.jobID === job.id)
            .map((target) => target.sessionID)
          const snapshotSet = new Set(snapshotSessions)

          // A retry/replacement was published while aborts were in flight.
          // Leave this job open so the next bounded pass can abort the newer
          // owner instead of declaring the old session's result authoritative.
          if (currentSessions.some((sessionID) => !snapshotSet.has(sessionID))) {
            replacementStillPresent = true
            continue
          }

          const failure = currentSessions.map((sessionID) => abortErrors.get(sessionID)).find(Boolean)
          if (failure) {
            hasFailure = true
            if (canTransitionTeamJob(job.status, "cancel_failed")) {
              transitionTeamJob(job, "cancel_failed", `${reason} Abort failed: ${failure}`)
            } else {
              transitionTeamJob(job, "cancelled", `${reason} Abort failed: ${failure}`)
              job.error = `${reason} Abort failed: ${failure}`
            }
          } else if (canTransitionTeamJob(job.status, "cancelled")) {
            transitionTeamJob(job, "cancelled", reason)
          }

          job.retryPending = false
          job.retrySessionID = undefined
          job.deadlineAt = undefined
          job.lastHeartbeatAt = undefined
          job.finishedAt = now()
          job.updatedAt = now()
        }

        const openJobs = run.jobs.filter(isOpenJob)
        const cancelFailed = run.jobs.some((job) => job.status === "cancel_failed")
        if (cancelFailed || openJobs.length > 0 || hasFailure) {
          run.status = "degraded"
          run.notificationPending = true
          draft.activeRunID = run.id
        } else {
          run.status = "cancelled"
          run.notificationPending = false
          run.notificationError = undefined
          if (draft.activeRunID === run.id) draft.activeRunID = undefined
        }
        run.updatedAt = now()
      }
    })

    if (!replacementStillPresent) break
  }

  // If a replacement kept appearing beyond the bounded cleanup window, make
  // the unresolved ownership visible and fail closed. Never leave the run
  // looking normally active after its parent has vanished.
  await updateTeamState(directory, (draft) => {
    for (const run of draft.runs) {
      if (!affectedRunIDs.has(run.id) || isClosedRun(run)) continue
      let changed = false
      for (const job of run.jobs) {
        if (!isOpenJob(job)) continue
        changed = true
        if (canTransitionTeamJob(job.status, "cancel_failed")) {
          transitionTeamJob(
            job,
            "cancel_failed",
            `${reason} Cleanup did not converge after ${MAX_PARENT_GONE_ABORT_PASSES} passes.`,
          )
        } else if (canTransitionTeamJob(job.status, "cancelled")) {
          transitionTeamJob(job, "cancelled", `${reason} Cleanup did not converge.`)
        }
        job.retryPending = false
        job.retrySessionID = undefined
        job.deadlineAt = undefined
        job.lastHeartbeatAt = undefined
        job.finishedAt = now()
        job.updatedAt = now()
      }
      if (changed) {
        const failed = run.jobs.some((job) => job.status === "cancel_failed")
        run.status = failed ? "degraded" : "cancelled"
        run.notificationPending = failed
        run.updatedAt = now()
        if (failed) draft.activeRunID = run.id
        else if (draft.activeRunID === run.id) draft.activeRunID = undefined
      }
    }
  })

  return Array.from(affectedRunIDs)
}
