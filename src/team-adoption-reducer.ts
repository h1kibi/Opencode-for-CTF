import { now, type TeamAgent, type TeamJob, type TeamParentAdoption, type TeamRun } from "./team/team-types.ts"

const MAX_ADOPTION_HISTORY = 8

export type OrphanJobAdoptionInput = {
  replacementSessionID: string
  replacementAgent: TeamAgent
  adoptedBySessionID: string
  reason: string
  ownerToken: string
  previousSessionID?: string
  at?: string
}

export type ParentRebindInput = {
  previousParentSessionID: string
  adoptedBySessionID: string
  reason: string
}

function isOrphanedJob(job: TeamJob): boolean {
  return job.status === "orphaned" || job.orphaned?.state === "orphaned"
}

export function prepareOrphanJobAdoption(run: TeamRun, job: TeamJob, input: OrphanJobAdoptionInput): boolean {
  if (!isOrphanedJob(job)) return false
  const stamp = input.at ?? now()

  run.parentSessionID = input.adoptedBySessionID
  run.status = "dispatching"
  run.notificationPending = false
  run.updatedAt = stamp

  job.originalAgent = job.originalAgent || job.agent
  const originalAgent = job.originalAgent
  job.agent = input.replacementAgent
  const probe = run.probes.find((candidate) => candidate.id === job.probeId)
  if (probe) {
    probe.agent = input.replacementAgent
    probe.status = "queued"
    probe.updatedAt = stamp
  }

  job.sessionID = input.replacementSessionID
  job.status = "starting"
  job.orphaned = undefined
  job.retryPending = false
  job.retrySessionID = undefined
  job.startedAt = undefined
  job.finishedAt = undefined
  job.error = `Adopted orphaned worker: ${input.reason}`
  job.updatedAt = stamp
  job.ownerToken = input.ownerToken
  job.adoptionHistory = [
    ...(job.adoptionHistory ?? []),
    {
      originalAgent,
      adoptedAgent: input.replacementAgent,
      adoptedAt: stamp,
      adoptedBySessionID: input.adoptedBySessionID,
      reason: input.reason,
      ...(input.previousSessionID ? { previousSessionID: input.previousSessionID } : {}),
    },
  ].slice(-MAX_ADOPTION_HISTORY)
  return true
}

export function rebindTeamParent(run: TeamRun, input: ParentRebindInput): TeamParentAdoption | undefined {
  if (run.parentSessionID !== input.previousParentSessionID) return undefined
  const audit: TeamParentAdoption = {
    previousParentSessionID: input.previousParentSessionID,
    adoptedAt: now(),
    adoptedBySessionID: input.adoptedBySessionID,
    reason: input.reason,
  }
  run.parentSessionID = input.adoptedBySessionID
  run.adoptionHistory = [...(run.adoptionHistory ?? []), audit].slice(-MAX_ADOPTION_HISTORY)
  run.notificationError = undefined
  run.notificationSentAt = undefined
  run.notificationPending = ["ready_for_synthesis", "degraded"].includes(run.status)
  run.updatedAt = now()
  return audit
}
