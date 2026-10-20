import { mkdir, readFile, readdir, rename, stat } from "node:fs/promises"
import path from "node:path"
import { DEFAULT_FILE_LOCK_STALE_MS } from "../file-lock.ts"
import { atomicUpdateJsonFile } from "../state-store.ts"
import { TEAM_AGENTS, TEAM_ROUTE_IDS } from "./team-types.ts"
import type { TeamJob, TeamRun, TeamState } from "./team-types.ts"
import { STATE_FILE, STATE_VERSION, now } from "./team-types.ts"
import { deriveTeamRunStatus } from "../team-reducer.ts"

export function teamStatePath(directory: string) {
  return path.join(directory, STATE_FILE)
}

function statePath(directory: string) {
  return teamStatePath(directory)
}

export function emptyTeamState(): TeamState {
  return { schemaVersion: STATE_VERSION, revision: 0, updatedAt: now(), runs: [] }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const TEAM_JOB_STATUSES = [
  "queued",
  "starting",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "cancel_failed",
  "interrupted",
  "orphaned",
] as const

const TEAM_FACT_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const

const TEAM_INTENT_STATUSES = [
  "open",
  "claimed",
  "running",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "superseded",
] as const

const TEAM_INTENT_CONCURRENCIES = ["exclusive", "parallel", "speculative"] as const

const TEAM_RUN_STATUSES = [
  "dispatching",
  "running",
  "ready_for_synthesis",
  "degraded",
  "completed",
  "cancelled",
  "cancelling",
] as const

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value)
}

export function parseTeamState(value: unknown): TeamState {
  if (!isObject(value)) throw new Error("Invalid CTF team state: expected an object.")
  if (value.schemaVersion !== STATE_VERSION) {
    throw new Error(`Unsupported CTF team state version: ${String(value.schemaVersion)}`)
  }
  if (!Array.isArray(value.runs)) throw new Error("Invalid CTF team state: runs must be an array.")

  const sessionIDs = new Set<string>()
  const runIDs = new Set<string>()
  for (const run of value.runs) {
    if (!isObject(run) || typeof run.id !== "string" || !run.id) {
      throw new Error("Invalid CTF team state: each run must have an id.")
    }
    if (runIDs.has(run.id)) throw new Error(`Invalid CTF team state: duplicate run id ${run.id}.`)
    runIDs.add(run.id)
    if (!isOneOf(TEAM_RUN_STATUSES, run.status)) {
      throw new Error(`Invalid CTF team state: run ${run.id} has an unknown status.`)
    }
    if (!Array.isArray(run.jobs)) throw new Error(`Invalid CTF team state: run ${run.id} jobs must be an array.`)

    const jobIDs = new Set<string>()
    for (const job of run.jobs) {
      if (!isObject(job) || typeof job.id !== "string" || !job.id) {
        throw new Error(`Invalid CTF team state: run ${run.id} contains a job without an id.`)
      }
      if (jobIDs.has(job.id)) throw new Error(`Invalid CTF team state: duplicate job id ${job.id} in run ${run.id}.`)
      jobIDs.add(job.id)
      if (!isOneOf(TEAM_JOB_STATUSES, job.status)) {
        throw new Error(`Invalid CTF team state: job ${job.id} has an unknown status.`)
      }
      if (job.agent !== undefined && !isOneOf(TEAM_AGENTS, job.agent)) {
        const originalAgent = String(job.agent)
        const previousOrphaned = isObject(job.orphaned) ? job.orphaned : undefined
        job.agent = TEAM_AGENTS[0]
        job.originalAgent = originalAgent
        job.orphaned = {
          state: "orphaned",
          reason: "unknown_agent",
          originalAgent,
          recoverable: true,
          detectedAt: typeof previousOrphaned?.detectedAt === "string" ? previousOrphaned.detectedAt : now(),
        }
        job.status = "orphaned"
        job.error = job.error || `Unknown agent ${originalAgent}; worker is orphaned and cannot be restarted.`
      }
      if (job.routeId !== undefined && !isOneOf(TEAM_ROUTE_IDS, job.routeId)) {
        throw new Error(`Invalid CTF team state: job ${job.id} has an unknown route.`)
      }
      if (job.concurrency !== undefined && job.concurrency !== "independent" && job.concurrency !== "shared_state") {
        throw new Error(`Invalid CTF team state: job ${job.id} has an unknown concurrency mode.`)
      }
      if (job.sessionID !== undefined) {
        if (typeof job.sessionID !== "string" || !job.sessionID) {
          throw new Error(`Invalid CTF team state: job ${job.id} has an invalid session id.`)
        }
        if (sessionIDs.has(job.sessionID)) {
          throw new Error(`Invalid CTF team state: session ${job.sessionID} is bound to multiple jobs.`)
        }
        sessionIDs.add(job.sessionID)
      }
    }

    const factIDs = new Set<string>()
    if (run.facts !== undefined) {
      if (!Array.isArray(run.facts)) throw new Error(`Invalid CTF team state: run ${run.id} facts must be an array.`)
      for (const fact of run.facts) {
        if (!isObject(fact) || typeof fact.id !== "string" || !fact.id) {
          throw new Error(`Invalid CTF team state: run ${run.id} contains a fact without an id.`)
        }
        if (factIDs.has(fact.id))
          throw new Error(`Invalid CTF team state: duplicate fact id ${fact.id} in run ${run.id}.`)
        factIDs.add(fact.id)
      }
    }

    const intentIDs = new Set<string>()
    if (run.intents !== undefined) {
      if (!Array.isArray(run.intents))
        throw new Error(`Invalid CTF team state: run ${run.id} intents must be an array.`)
      for (const intent of run.intents) {
        if (!isObject(intent) || typeof intent.id !== "string" || !intent.id) {
          throw new Error(`Invalid CTF team state: run ${run.id} contains an intent without an id.`)
        }
        if (intentIDs.has(intent.id))
          throw new Error(`Invalid CTF team state: duplicate intent id ${intent.id} in run ${run.id}.`)
        intentIDs.add(intent.id)
      }
    }

    for (const fact of run.facts ?? []) {
      if (!isObject(fact)) continue
      if (fact.runId !== run.id) throw new Error(`Invalid CTF team state: fact ${fact.id} belongs to another run.`)
      if (!isOneOf(TEAM_FACT_STATUSES, fact.status))
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an unknown status.`)
      if (!isOneOf(TEAM_ROUTE_IDS, fact.routeId))
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an unknown route.`)
      if (!isOneOf(["observation", "measurement", "artifact", "error", "negative", "candidate"] as const, fact.kind))
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an unknown kind.`)
      if (!isOneOf(["observed", "probable", "speculative", "confirmed"] as const, fact.confidence))
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an unknown confidence.`)
      if (fact.status === "accepted" && fact.confidence !== "confirmed")
        throw new Error(`Invalid CTF team state: accepted fact ${fact.id} must be confirmed.`)
      if (fact.status !== "accepted" && fact.confidence === "confirmed")
        throw new Error(`Invalid CTF team state: unaccepted fact ${fact.id} cannot be confirmed.`)
      if (
        fact.status === "accepted" &&
        (typeof fact.reviewedBy !== "string" ||
          !fact.reviewedBy ||
          typeof fact.reviewedAt !== "string" ||
          !fact.reviewedAt)
      )
        throw new Error(`Invalid CTF team state: accepted fact ${fact.id} lacks reviewer provenance.`)
      if (typeof fact.sourceJobId !== "string" || !jobIDs.has(fact.sourceJobId))
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an unknown source job.`)
      const sourceJob = run.jobs.find((job) => isObject(job) && job.id === fact.sourceJobId)
      // Allow sourceSessionId to match either the current sessionID or any retrySessionID in the attempt history
      const validSessionIds = new Set([sourceJob?.sessionID, sourceJob?.retrySessionID].filter(Boolean))
      if (
        typeof fact.sourceSessionId !== "string" ||
        !fact.sourceSessionId ||
        !validSessionIds.has(fact.sourceSessionId)
      )
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an invalid source session.`)
      if (fact.intentId !== undefined && (typeof fact.intentId !== "string" || !intentIDs.has(fact.intentId)))
        throw new Error(`Invalid CTF team state: fact ${fact.id} references an unknown intent.`)
      if (fact.supersedesFactId !== undefined) {
        if (
          typeof fact.supersedesFactId !== "string" ||
          !factIDs.has(fact.supersedesFactId) ||
          fact.supersedesFactId === fact.id
        )
          throw new Error(`Invalid CTF team state: fact ${fact.id} has an invalid replacement reference.`)
        if (fact.status !== "pending" && fact.status !== "accepted")
          throw new Error(`Invalid CTF team state: replacement fact ${fact.id} has invalid status.`)
        if (
          fact.status === "accepted" &&
          (typeof fact.reviewedBy !== "string" ||
            !fact.reviewedBy ||
            typeof fact.reviewedAt !== "string" ||
            !fact.reviewedAt)
        )
          throw new Error(`Invalid CTF team state: accepted replacement fact ${fact.id} lacks reviewer provenance.`)
        const superseded = (run.facts ?? []).find(
          (candidate) => isObject(candidate) && candidate.id === fact.supersedesFactId,
        )
        if (!superseded || superseded.status !== "superseded")
          throw new Error(`Invalid CTF team state: fact ${fact.id} replaces a fact that is not superseded.`)
      }
      if (typeof fact.statement !== "string" || fact.statement.length === 0 || fact.statement.length > 2_000)
        throw new Error(`Invalid CTF team state: fact ${fact.id} has an invalid statement.`)
      if (
        !Array.isArray(fact.evidence) ||
        (fact.kind !== "error" && fact.evidence.length === 0) ||
        fact.evidence.length > 16
      )
        throw new Error(`Invalid CTF team state: fact ${fact.id} evidence must be a bounded non-empty array.`)
      for (const evidence of fact.evidence) {
        if (
          !isObject(evidence) ||
          !isOneOf(["command", "file", "response", "hash", "trace"] as const, evidence.type) ||
          typeof evidence.value !== "string" ||
          evidence.value.length === 0 ||
          evidence.value.length > 2_000
        ) {
          throw new Error(`Invalid CTF team state: fact ${fact.id} contains invalid evidence.`)
        }
      }
    }

    for (const intent of run.intents ?? []) {
      if (!isObject(intent)) continue
      if (intent.runId !== run.id)
        throw new Error(`Invalid CTF team state: intent ${intent.id} belongs to another run.`)
      if (!isOneOf(TEAM_INTENT_STATUSES, intent.status))
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an unknown status.`)
      if (!isOneOf(TEAM_ROUTE_IDS, intent.routeId))
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an unknown route.`)
      if (!isOneOf(TEAM_INTENT_CONCURRENCIES, intent.concurrency))
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an unknown concurrency mode.`)
      if (typeof intent.createdBy !== "string" || !isOneOf(["expert", "migration"] as const, intent.createdBy))
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an unknown creator.`)
      if (typeof intent.title !== "string" || intent.title.length === 0 || intent.title.length > 160)
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an invalid title.`)
      if (typeof intent.objective !== "string" || intent.objective.length === 0 || intent.objective.length > 8_000)
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an invalid objective.`)
      if (
        (typeof intent.expectedObservation !== "undefined" &&
          (typeof intent.expectedObservation !== "string" ||
            intent.expectedObservation.trim().length === 0 ||
            intent.expectedObservation.length > 2_000)) ||
        (typeof intent.stopCondition !== "undefined" &&
          (typeof intent.stopCondition !== "string" ||
            intent.stopCondition.trim().length === 0 ||
            intent.stopCondition.length > 2_000)) ||
        (typeof intent.failureCondition !== "undefined" &&
          (typeof intent.failureCondition !== "string" ||
            intent.failureCondition.trim().length === 0 ||
            intent.failureCondition.length > 2_000))
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an invalid convergence condition.`)
      if (
        (!intent.expectedObservation || intent.expectedObservation.trim().length === 0) &&
        (!intent.stopCondition || intent.stopCondition.trim().length === 0)
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has no convergence condition.`)
      if (
        !Array.isArray(intent.basedOnFactIds) ||
        new Set(intent.basedOnFactIds).size !== intent.basedOnFactIds.length ||
        intent.basedOnFactIds.some((id) => typeof id !== "string" || !factIDs.has(id))
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has invalid fact references.`)
      if (
        !Array.isArray(intent.requiredCapabilities) ||
        intent.requiredCapabilities.length > 32 ||
        intent.requiredCapabilities.some(
          (capability) => typeof capability !== "string" || capability.length === 0 || capability.length > 128,
        )
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has invalid capabilities.`)
      if (
        typeof intent.attempts !== "number" ||
        !Number.isInteger(intent.attempts) ||
        intent.attempts < 0 ||
        typeof intent.maxAttempts !== "number" ||
        !Number.isInteger(intent.maxAttempts) ||
        intent.maxAttempts < 1 ||
        intent.attempts > intent.maxAttempts
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has invalid attempt counters.`)
      if (
        intent.resultFactIds !== undefined &&
        (!Array.isArray(intent.resultFactIds) ||
          new Set(intent.resultFactIds).size !== intent.resultFactIds.length ||
          intent.resultFactIds.some((id) => typeof id !== "string" || !factIDs.has(id)))
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has invalid result fact references.`)
      if (
        intent.resultArtifacts !== undefined &&
        (!Array.isArray(intent.resultArtifacts) ||
          intent.resultArtifacts.length > 32 ||
          intent.resultArtifacts.some(
            (artifact) => typeof artifact !== "string" || artifact.length === 0 || artifact.length > 1_000,
          ))
      )
        throw new Error(`Invalid CTF team state: intent ${intent.id} has invalid result artifacts.`)
      if (intent.claimedBy !== undefined) {
        if (typeof intent.claimedBy !== "string" || !jobIDs.has(intent.claimedBy))
          throw new Error(
            `Invalid CTF team state: intent ${intent.id} is claimed by unknown job ${String(intent.claimedBy)}.`,
          )
        const hasAnyFence = intent.claimToken !== undefined || intent.claimExpiresAt !== undefined
        const hasCompleteFence = intent.claimToken !== undefined && intent.claimExpiresAt !== undefined
        if (hasAnyFence && !hasCompleteFence)
          throw new Error(`Invalid CTF team state: intent ${intent.id} has an incomplete claim fence.`)
        if ((intent.status === "claimed" || intent.status === "running") && !hasCompleteFence)
          throw new Error(`Invalid CTF team state: active intent ${intent.id} has no complete claim fence.`)
        if (hasCompleteFence) {
          const claimedJob = run.jobs.find((job) => isObject(job) && job.id === intent.claimedBy)
          if (!claimedJob || claimedJob.intentId !== intent.id || claimedJob.ownerToken !== intent.claimToken)
            throw new Error(`Invalid CTF team state: intent ${intent.id} claim fence does not match its job.`)
        }
      } else if (intent.claimToken !== undefined || intent.claimExpiresAt !== undefined) {
        throw new Error(`Invalid CTF team state: intent ${intent.id} has an incomplete claim fence.`)
      }
      if ((intent.status === "claimed" || intent.status === "running") && !intent.claimedBy)
        throw new Error(`Invalid CTF team state: active intent ${intent.id} has no claim owner.`)
    }
  }
  return value as TeamState
}

export async function readTeamState(directory: string): Promise<TeamState> {
  try {
    return parseTeamState(JSON.parse(await readFile(statePath(directory), "utf8")))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyTeamState()
    throw error
  }
}

export function isOrphanedJob(job: Pick<TeamJob, "orphaned" | "status">): boolean {
  return job.status === "orphaned" || job.orphaned?.state === "orphaned"
}

export type TeamStateQuarantineResult = {
  quarantined: boolean
  source: string
  destination?: string
  reason: string
}

/** Preserve an unreadable state file and reset the live state atomically enough
 * for a subsequent dispatch. This is deliberately explicit: callers must
 * choose repair/quarantine rather than silently discarding evidence. */
export async function quarantineTeamState(directory: string, reason: string): Promise<TeamStateQuarantineResult> {
  const source = statePath(directory)
  const quarantineDir = path.join(directory, ".ctf-team-quarantine")
  try {
    await stat(source)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { quarantined: false, source, reason: "state file does not exist" }
    }
    throw error
  }
  await mkdir(quarantineDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const destination = path.join(quarantineDir, `${STATE_FILE}.${stamp}.json`)
  await rename(source, destination)
  await writeTeamState(directory, emptyTeamState())
  return { quarantined: true, source, destination, reason }
}

export async function readRawTeamState(directory: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(statePath(directory), "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

export async function writeTeamState(directory: string, state: TeamState) {
  await atomicUpdateJsonFile<TeamState>(statePath(directory), emptyTeamState(), () => state)
}

export async function updateTeamState(
  directory: string,
  update: (state: TeamState) => void | Promise<void>,
): Promise<TeamState> {
  const file = statePath(directory)
  return atomicUpdateJsonFile<TeamState>(file, emptyTeamState(), async (state) => {
    const parsed = parseTeamState(state)
    await update(parsed)
    parsed.revision++
    parsed.updatedAt = now()
    return parsed
  })
}

export function findRun(state: TeamState, runID?: string) {
  const id = runID ?? state.activeRunID
  return id ? state.runs.find((r) => r.id === id) : undefined
}

export function findJobBySession(state: TeamState, sessionID: string) {
  for (const run of state.runs) {
    const job = run.jobs.find((j) => j.sessionID === sessionID)
    if (job) return { run, job }
  }
  return undefined
}

export function isTerminalJob(status: TeamJob["status"]) {
  return ["completed", "failed", "cancelled", "cancel_failed", "interrupted", "orphaned"].includes(status)
}

function isClosedRun(status: TeamRun["status"]) {
  return status === "completed" || status === "cancelled"
}

/**
 * Normalization runs on a persisted file, so it must tolerate a run whose
 * recorded status has drifted from its jobs. The canonical deriver already
 * refuses to reopen `completed`/`cancelled`, so only genuinely inconsistent
 * states (a closed run with a live job) are re-derived here — reusing the one
 * canonical derivation keeps status from flipping between a write and the next
 * `ctf-team-status`.
 */
function deriveRunStatusFromJobs(run: TeamRun): TeamRun["status"] {
  if (isClosedRun(run.status) && run.jobs.every((job) => isTerminalJob(job.status))) return run.status
  // A closed run with a live job is inconsistent (usually a crash or a late
  // cancellation race). Pass no `current` so the canonical deriver re-derives
  // from the jobs instead of short-circuiting on the stale closed flag.
  return run.jobs.some((job) => !isTerminalJob(job.status))
    ? deriveTeamRunStatus(run.jobs)
    : deriveTeamRunStatus(run.jobs, run.status)
}

export type TeamStateHygieneReport = {
  changed: boolean
  repairs: string[]
}

export function normalizeTeamState(state: TeamState): TeamStateHygieneReport {
  const repairs: string[] = []

  for (const run of state.runs) {
    const previousStatus = run.status
    const nextStatus = deriveRunStatusFromJobs(run)
    if (
      previousStatus !== nextStatus &&
      (run.jobs.every((job) => isTerminalJob(job.status)) ||
        previousStatus === "dispatching" ||
        previousStatus === "running" ||
        (isClosedRun(previousStatus) && !run.jobs.every((job) => isTerminalJob(job.status))))
    ) {
      run.status = nextStatus
      repairs.push(`run ${run.id}: status ${previousStatus} -> ${nextStatus}`)
    }

    if (!run.jobs.every((job) => isTerminalJob(job.status))) {
      if (run.notificationPending) {
        run.notificationPending = false
        repairs.push(`run ${run.id}: cleared notificationPending while workers are still active`)
      }
      if (run.notificationSentAt) {
        run.notificationSentAt = undefined
        repairs.push(`run ${run.id}: cleared notificationSentAt while workers are still active`)
      }
      if (run.notificationError) {
        run.notificationError = undefined
        repairs.push(`run ${run.id}: cleared stale notificationError while workers are still active`)
      }
      continue
    }

    if (run.notificationSentAt && run.notificationPending) {
      run.notificationPending = false
      repairs.push(`run ${run.id}: cleared notificationPending because notificationSentAt already exists`)
    }

    if (run.status === "ready_for_synthesis" || run.status === "degraded") {
      if (!run.notificationSentAt && !run.notificationPending) {
        run.notificationPending = true
        repairs.push(`run ${run.id}: restored notificationPending for a synthesized-ready run`)
      }
      continue
    }

    if (isClosedRun(run.status) && run.notificationPending) {
      run.notificationPending = false
      repairs.push(`run ${run.id}: cleared notificationPending for closed run`)
    }
  }

  if (state.activeRunID) {
    const activeRun = state.runs.find((run) => run.id === state.activeRunID)
    if (!activeRun) {
      repairs.push(`activeRunID ${state.activeRunID} cleared because the run no longer exists`)
      state.activeRunID = undefined
    } else if (isClosedRun(activeRun.status)) {
      repairs.push(`activeRunID ${state.activeRunID} cleared because the run is ${activeRun.status}`)
      state.activeRunID = undefined
    }
  }

  if (!state.activeRunID) {
    const candidate = [...state.runs].reverse().find((run) => !isClosedRun(run.status))
    if (candidate) {
      state.activeRunID = candidate.id
      repairs.push(`activeRunID restored to ${candidate.id}`)
    }
  }

  return { changed: repairs.length > 0, repairs }
}

function detectUnknownAgentRepairs(value: unknown): string[] {
  if (!isObject(value) || !Array.isArray(value.runs)) return []
  const repairs: string[] = []
  for (const run of value.runs) {
    if (!isObject(run) || typeof run.id !== "string" || !Array.isArray(run.jobs)) continue
    for (const job of run.jobs) {
      if (!isObject(job) || typeof job.id !== "string") continue
      if (job.agent !== undefined && !isOneOf(TEAM_AGENTS, job.agent)) {
        repairs.push(`run ${run.id} job ${job.id}: unknown agent ${String(job.agent)} marked orphaned`)
      }
    }
  }
  return repairs
}

export async function normalizePersistedTeamState(directory: string): Promise<{ state: TeamState; repairs: string[] }> {
  const raw = await readRawTeamState(directory)
  const unknownAgentRepairs = detectUnknownAgentRepairs(raw)
  const current = raw === undefined ? emptyTeamState() : parseTeamState(raw)
  const initial = normalizeTeamState(current)
  if (!initial.changed && unknownAgentRepairs.length === 0) return { state: current, repairs: [] }

  let repairs: string[] = []
  const state = await updateTeamState(directory, (draft) => {
    repairs = [...unknownAgentRepairs, ...normalizeTeamState(draft).repairs]
  })
  return { state, repairs }
}

export function teamLockDir(directory: string) {
  return path.resolve(directory, ".ctf-locks")
}

export type TeamLockEntryStatus = "active" | "stale" | "released" | "unknown"

export interface TeamLockEntry {
  sentinel: string
  lockfile: string
  status: TeamLockEntryStatus
  ageMs?: number
}

export async function inspectTeamLockState(directory: string): Promise<{
  path: string
  present: boolean
  fileCount: number
  sentinelCount: number
  activeLockCount: number
  staleLockCount: number
  entries: TeamLockEntry[]
}> {
  const lockPath = teamLockDir(directory)
  try {
    const directoryEntries = await readdir(lockPath, { withFileTypes: true })
    const fileCount = directoryEntries.filter((entry) => entry.isFile()).length
    const sentinels = directoryEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".lock"))
    const entries: TeamLockEntry[] = []

    for (const sentinelEntry of sentinels) {
      const sentinel = path.join(lockPath, sentinelEntry.name)
      const lockfile = `${sentinel}.lock`
      let status: TeamLockEntryStatus = "released"
      let ageMs: number | undefined
      try {
        const lockStats = await stat(lockfile)
        const ownerFile = `${sentinel}.owner`
        // proper-lockfile creates the lease directory before withFileLock has
        // written its owner token. Do not report that short acquisition
        // window as a confirmed active lease; diagnostics callers otherwise
        // observe activeLockCount=1 before the callback has started.
        await stat(ownerFile)
        ageMs = Math.max(0, Date.now() - lockStats.mtimeMs)
        status = ageMs >= DEFAULT_FILE_LOCK_STALE_MS ? "stale" : "active"
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") status = "unknown"
      }
      entries.push({ sentinel, lockfile, status, ...(ageMs === undefined ? {} : { ageMs }) })
    }

    return {
      path: lockPath,
      present: true,
      fileCount,
      sentinelCount: entries.length,
      activeLockCount: entries.filter((entry) => entry.status === "active").length,
      staleLockCount: entries.filter((entry) => entry.status === "stale").length,
      entries,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        path: lockPath,
        present: false,
        fileCount: 0,
        sentinelCount: 0,
        activeLockCount: 0,
        staleLockCount: 0,
        entries: [],
      }
    }
    throw error
  }
}

export function buildQueuedRun(args: {
  title: string
  parentSessionID: string
  jobs: Array<Pick<TeamJob, "title" | "objective" | "agent" | "routeId" | "concurrency">>
  runId: string
}): TeamRun {
  const timestamp = now()
  return {
    id: args.runId,
    title: args.title,
    parentSessionID: args.parentSessionID,
    status: "dispatching",
    createdAt: timestamp,
    updatedAt: timestamp,
    notificationPending: false,
    jobs: args.jobs.map((job, index) => ({
      id: `job-${index + 1}-${
        job.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32) || "task"
      }`,
      title: job.title,
      objective: job.objective,
      agent: job.agent,
      routeId: job.routeId,
      concurrency: job.concurrency || "independent",
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  }
}
