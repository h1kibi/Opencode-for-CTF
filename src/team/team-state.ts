import { mkdir, readFile, readdir, rename, stat } from "node:fs/promises"
import path from "node:path"
import { DEFAULT_FILE_LOCK_STALE_MS, withFileLock } from "../file-lock.ts"
import { atomicUpdateJsonFile, saveJsonFile } from "../state-store.ts"
import { TEAM_AGENTS, TEAM_ROUTE_IDS } from "./team-types.ts"
import type { TeamJob, TeamRun, TeamState } from "./team-types.ts"
import { STATE_FILE, STATE_VERSION, now } from "./team-types.ts"
import { deriveTeamRunStatus, isTerminalTeamJob } from "../team-reducer.ts"

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

const TEAM_PROBE_STATUSES = ["queued", "running", "completed", "blocked", "failed", "cancelled"] as const
const TEAM_RUN_STATUSES = [
  "dispatching",
  "running",
  "ready_for_synthesis",
  "degraded",
  "completed",
  "cancelled",
  "cancelling",
] as const
const TEAM_PROBE_KINDS = ["observation", "measurement", "artifact", "error", "negative", "candidate"] as const

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value)
}

function validProbeResult(value: unknown): boolean {
  if (
    !isObject(value) ||
    value.protocol !== "ctf.team.probe.v1" ||
    value.type !== "probe_result" ||
    !isOneOf(["completed", "blocked", "failed"] as const, value.status) ||
    typeof value.summary !== "string" ||
    value.summary.length === 0 ||
    value.summary.length > 2_000 ||
    !Array.isArray(value.observations) ||
    value.observations.length > 64 ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length > 32 ||
    value.artifacts.some((artifact) => typeof artifact !== "string" || !artifact || artifact.length > 1_000) ||
    (value.next !== undefined && (typeof value.next !== "string" || !value.next || value.next.length > 2_000))
  ) {
    return false
  }
  return value.observations.every(
    (observation) =>
      isObject(observation) &&
      isOneOf(TEAM_PROBE_KINDS, observation.kind) &&
      typeof observation.statement === "string" &&
      observation.statement.length > 0 &&
      observation.statement.length <= 2_000 &&
      Array.isArray(observation.evidence) &&
      observation.evidence.length <= 16 &&
      observation.evidence.every(
        (evidence) =>
          isObject(evidence) &&
          isOneOf(["command", "file", "response", "hash", "trace"] as const, evidence.type) &&
          typeof evidence.value === "string" &&
          evidence.value.length > 0 &&
          evidence.value.length <= 2_000,
      ),
  )
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
    if (!Array.isArray(run.probes) || !Array.isArray(run.jobs)) {
      throw new Error(`Invalid CTF team state: run ${run.id} requires probes and jobs arrays.`)
    }

    const probeIDs = new Set<string>()
    for (const probe of run.probes) {
      if (!isObject(probe) || typeof probe.id !== "string" || !probe.id) {
        throw new Error(`Invalid CTF team state: run ${run.id} contains a probe without an id.`)
      }
      if (probeIDs.has(probe.id))
        throw new Error(`Invalid CTF team state: duplicate probe id ${probe.id} in run ${run.id}.`)
      probeIDs.add(probe.id)
      if (!isOneOf(TEAM_ROUTE_IDS, probe.routeId)) {
        throw new Error(`Invalid CTF team state: probe ${probe.id} has an unknown route.`)
      }
      if (!isOneOf(TEAM_PROBE_STATUSES, probe.status)) {
        throw new Error(`Invalid CTF team state: probe ${probe.id} has an unknown status.`)
      }
      if (
        typeof probe.title !== "string" ||
        probe.title.length === 0 ||
        probe.title.length > 160 ||
        typeof probe.objective !== "string" ||
        probe.objective.length === 0 ||
        probe.objective.length > 8_000
      ) {
        throw new Error(`Invalid CTF team state: probe ${probe.id} has invalid dispatch content.`)
      }
      if (probe.concurrency !== "independent" && probe.concurrency !== "shared_state") {
        throw new Error(`Invalid CTF team state: probe ${probe.id} has an unknown concurrency mode.`)
      }
      if (!isOneOf(TEAM_AGENTS, probe.agent)) {
        throw new Error(`Invalid CTF team state: probe ${probe.id} has an unknown agent.`)
      }
      if (probe.result !== undefined && !validProbeResult(probe.result)) {
        throw new Error(`Invalid CTF team state: probe ${probe.id} has an invalid result.`)
      }
    }

    const jobIDs = new Set<string>()
    const linkedProbeIDs = new Set<string>()
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
      if (typeof job.probeId !== "string" || !probeIDs.has(job.probeId)) {
        throw new Error(`Invalid CTF team state: job ${job.id} references an unknown probe.`)
      }
      if (linkedProbeIDs.has(job.probeId)) {
        throw new Error(`Invalid CTF team state: probe ${job.probeId} is assigned to multiple jobs.`)
      }
      if (typeof job.serializationRepairAttempts !== "undefined") {
        if (
          typeof job.serializationRepairAttempts !== "number" ||
          !Number.isInteger(job.serializationRepairAttempts) ||
          job.serializationRepairAttempts < 0 ||
          job.serializationRepairAttempts > 1
        ) {
          throw new Error(`Invalid CTF team state: job ${job.id} has an invalid serialization repair attempt count.`)
        }
      }
      if (
        typeof job.serializationRepairPending !== "undefined" &&
        typeof job.serializationRepairPending !== "boolean"
      ) {
        throw new Error(`Invalid CTF team state: job ${job.id} has an invalid serialization repair pending flag.`)
      }
      if (job.serializationRepairPending === true && (job.serializationRepairAttempts ?? 0) !== 1) {
        throw new Error(`Invalid CTF team state: job ${job.id} has a repair pending without a reserved attempt.`)
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
      linkedProbeIDs.add(job.probeId)
    }
    if (linkedProbeIDs.size !== probeIDs.size) {
      throw new Error(`Invalid CTF team state: run ${run.id} must have exactly one job per probe.`)
    }
  }
  return value as TeamState
}

export async function readTeamState(directory: string): Promise<TeamState> {
  try {
    return parseTeamState(JSON.parse(await readFile(statePath(directory), "utf8")))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyTeamState()
    if (await isLegacyTeamState(directory)) {
      await quarantineTeamState(directory, `legacy Team schema v1; clean cutover to schema v${STATE_VERSION}`)
      return readTeamState(directory)
    }
    throw error
  }
}

async function isLegacyTeamState(directory: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await readFile(statePath(directory), "utf8")) as unknown
    return isObject(raw) && raw.schemaVersion === 1
  } catch {
    return false
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

/** Preserve an unreadable state file and reset the live state while holding its state lock. */
export async function quarantineTeamState(directory: string, reason: string): Promise<TeamStateQuarantineResult> {
  const source = statePath(directory)
  return withFileLock(source, async (lease) => {
    let current: unknown | undefined
    let readable = true
    try {
      current = JSON.parse(await readFile(source, "utf8")) as unknown
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { quarantined: false, source, reason: "state file does not exist" }
      }
      readable = false
      if (reason.startsWith("legacy Team schema v1")) {
        return { quarantined: false, source, reason: "state changed before legacy quarantine" }
      }
    }
    if (
      reason.startsWith("legacy Team schema v1") &&
      (!readable || !isObject(current) || current.schemaVersion !== 1)
    ) {
      return { quarantined: false, source, reason: "state changed before legacy quarantine" }
    }
    const quarantineDir = path.join(directory, ".ctf-team-quarantine")
    await mkdir(quarantineDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const destination = path.join(quarantineDir, `${STATE_FILE}.${stamp}-${process.pid}.json`)
    await lease.assertOwned()
    await rename(source, destination)
    await saveJsonFile(source, emptyTeamState())
    await lease.assertOwned()
    return { quarantined: true, source, destination, reason }
  })
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

export { isTerminalTeamJob as isTerminalJob } from "../team-reducer.ts"

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
  if (isClosedRun(run.status) && run.jobs.every((job) => isTerminalTeamJob(job.status))) return run.status
  // A closed run with a live job is inconsistent (usually a crash or a late
  // cancellation race). Pass no `current` so the canonical deriver re-derives
  // from the jobs instead of short-circuiting on the stale closed flag.
  return run.jobs.some((job) => !isTerminalTeamJob(job.status))
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
      (run.jobs.every((job) => isTerminalTeamJob(job.status)) ||
        previousStatus === "dispatching" ||
        previousStatus === "running" ||
        (isClosedRun(previousStatus) && !run.jobs.every((job) => isTerminalTeamJob(job.status))))
    ) {
      run.status = nextStatus
      repairs.push(`run ${run.id}: status ${previousStatus} -> ${nextStatus}`)
    }

    if (!run.jobs.every((job) => isTerminalTeamJob(job.status))) {
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
  if (raw !== undefined && isObject(raw) && raw.schemaVersion === 1) {
    await quarantineTeamState(directory, `legacy Team schema v1; clean cutover to schema v${STATE_VERSION}`)
    return {
      state: await readTeamState(directory),
      repairs: ["legacy Team state quarantined; started an empty Probe runtime state"],
    }
  }
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
