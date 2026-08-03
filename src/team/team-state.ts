import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { DEFAULT_FILE_LOCK_STALE_MS } from "../file-lock.ts"
import { atomicUpdateJsonFile } from "../state-store.ts"
import { TEAM_AGENTS, TEAM_ROUTE_IDS } from "./team-types.ts"
import type { TeamJob, TeamRun, TeamState } from "./team-types.ts"
import { STATE_FILE, STATE_VERSION, now } from "./team-types.ts"

function statePath(directory: string) {
  return path.join(directory, STATE_FILE)
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
] as const

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
  for (const run of value.runs) {
    if (!isObject(run) || typeof run.id !== "string" || !run.id) {
      throw new Error("Invalid CTF team state: each run must have an id.")
    }
    if (!isOneOf(TEAM_RUN_STATUSES, run.status)) {
      throw new Error(`Invalid CTF team state: run ${run.id} has an unknown status.`)
    }
    if (!Array.isArray(run.jobs)) throw new Error(`Invalid CTF team state: run ${run.id} jobs must be an array.`)

    for (const job of run.jobs) {
      if (!isObject(job) || typeof job.id !== "string" || !job.id) {
        throw new Error(`Invalid CTF team state: run ${run.id} contains a job without an id.`)
      }
      if (!isOneOf(TEAM_JOB_STATUSES, job.status)) {
        throw new Error(`Invalid CTF team state: job ${job.id} has an unknown status.`)
      }
      if (job.agent !== undefined && !isOneOf(TEAM_AGENTS, job.agent)) {
        throw new Error(`Invalid CTF team state: job ${job.id} has an unknown agent.`)
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
        if (!isOneOf(TEAM_AGENTS, job.agent)) {
          throw new Error(`Invalid CTF team state: session-bound job ${job.id} has no valid agent identity.`)
        }
        if (sessionIDs.has(job.sessionID)) {
          throw new Error(`Invalid CTF team state: session ${job.sessionID} is bound to multiple jobs.`)
        }
        sessionIDs.add(job.sessionID)
      }
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
    parsed.runs = parsed.runs.slice(-20)
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
  return ["completed", "failed", "cancelled", "cancel_failed", "interrupted"].includes(status)
}

function isClosedRun(status: TeamRun["status"]) {
  return status === "completed" || status === "cancelled"
}

function deriveRunStatusFromJobs(run: TeamRun): TeamRun["status"] {
  // A closed run with a non-terminal job is inconsistent (usually a crash or
  // a late cancellation race). Re-open it for reconciliation instead of
  // treating the stale closed flag as proof that the worker is gone.
  if (isClosedRun(run.status) && run.jobs.every((job) => isTerminalJob(job.status))) return run.status
  if (run.jobs.some((job) => job.status === "cancel_failed")) return "degraded"
  if (run.jobs.some((job) => !isTerminalJob(job.status))) {
    return run.jobs.some((job) => job.status === "queued" || job.status === "starting") ? "dispatching" : "running"
  }
  if (run.jobs.length > 0 && run.jobs.every((job) => job.status === "cancelled")) return "cancelled"
  return run.jobs.some((job) => job.status === "completed") ? "ready_for_synthesis" : "degraded"
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

export async function normalizePersistedTeamState(directory: string): Promise<{ state: TeamState; repairs: string[] }> {
  const current = await readTeamState(directory)
  const initial = normalizeTeamState(current)
  if (!initial.changed) return { state: current, repairs: [] }

  let repairs: string[] = []
  const state = await updateTeamState(directory, (draft) => {
    repairs = normalizeTeamState(draft).repairs
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
