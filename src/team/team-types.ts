import { randomUUID } from "node:crypto"

export const TEAM_AGENTS = [
  "ctf-router",
  "ctf-web",
  "ctf-pwn",
  "ctf-rev",
  "ctf-crypto",
  "ctf-forensics",
  "ctf-misc",
  "ctf-aisec",
] as const

export type TeamAgent = (typeof TEAM_AGENTS)[number]

export type TeamJobStatus =
  | "queued"
  | "starting"
  | "running"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled"
  | "cancel_failed"
  | "interrupted"
  | "orphaned"

export type TeamJobErrorType =
  | "child_session_startup"
  | "agent_registry"
  | "tool_surface"
  | "skill_load"
  | "prompt_injection"
  | "heartbeat"
  | "worker_runtime"
  | "provider_policy"
  | "parent_model"
  | "serialization"
  | "unknown"

export type TeamJobErrorPhase =
  "dispatching" | "session_create" | "session_start" | "prompt_injection" | "running" | "collect" | "finalize"

export type TeamJobError = {
  errorType: TeamJobErrorType
  message: string
  phase: TeamJobErrorPhase
  agent: string
  parentSessionID: string
  childSessionID?: string
  jobID: string
  retryable: boolean
  timestamp: string
  cause?: string
  stack?: string
}

export type TeamRunStatus =
  "dispatching" | "running" | "ready_for_synthesis" | "degraded" | "completed" | "cancelled" | "cancelling"

export type TeamRouteId = "recon" | "R1" | "R2" | "R3" | "general"

export type ProbeObservationKind = "observation" | "measurement" | "artifact" | "error" | "negative" | "candidate"

export type TeamEvidenceRef = {
  type: "command" | "file" | "response" | "hash" | "trace"
  value: string
}

export type ProbeObservation = {
  kind: ProbeObservationKind
  statement: string
  evidence: TeamEvidenceRef[]
}

export type ProbeResult = {
  protocol: "ctf.team.probe.v1"
  type: "probe_result"
  status: "completed" | "blocked" | "failed"
  summary: string
  observations: ProbeObservation[]
  artifacts: string[]
  next?: string
}

export type TeamProbeStatus = "queued" | "running" | "completed" | "blocked" | "failed" | "cancelled"

export type TeamProbe = {
  id: string
  title: string
  objective: string
  agent: TeamAgent
  routeId: TeamRouteId
  concurrency: "independent" | "shared_state"
  status: TeamProbeStatus
  createdAt: string
  updatedAt: string
  result?: ProbeResult
}

export type TeamEventType =
  "probe_created" | "probe_started" | "probe_completed" | "probe_blocked" | "probe_failed" | "probe_cancelled"

export type TeamEvent = {
  id: string
  type: TeamEventType
  runId: string
  jobId?: string
  probeId?: string
  at: string
  data?: Record<string, unknown>
}

export const TEAM_ROUTE_IDS = ["recon", "R1", "R2", "R3", "general"] as const

export type TeamOrphanedMetadata = {
  state: "orphaned"
  reason: "unknown_agent" | "malformed_state" | "missing_session"
  originalAgent?: string
  recoverable: boolean
  detectedAt?: string
}

export type TeamJob = {
  id: string
  probeId: string
  /** Last valid agent identity used for type compatibility. Orphaned jobs fail closed. */
  agent: TeamAgent
  /** Raw agent name retained when the persisted state referenced an unknown agent. */
  originalAgent?: string
  orphaned?: TeamOrphanedMetadata
  sessionID?: string
  status: TeamJobStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  retryAttempt?: number
  /** Supervisor: hard deadline (ISO) after which a stalled running worker is interrupted. */
  deadlineAt?: string
  /** Configured per-attempt runtime budget in milliseconds. */
  timeoutMs?: number
  /** Supervisor: last reconcile poll that observed the worker still alive. */
  lastHeartbeatAt?: string
  /** Supervisor: how many times this job has exceeded a deadline. */
  attempt?: number
  /** Supervisor: when a timeout-driven abort was requested. */
  abortRequestedAt?: string
  /** Supervisor: when a timeout-driven abort succeeded. */
  abortSucceededAt?: string
  /** Fencing token for cancel/retry races. */
  ownerToken?: string
  /** True while the supervisor has reserved this job for replacement startup. */
  retryPending?: boolean
  /** Replacement session persisted before prompt so restart recovery can abort it. */
  retrySessionID?: string
  /** Bounded serialization repair prompts sent to this worker session (0 or 1). */
  serializationRepairAttempts?: number
  /** Repair prompt has been reserved but not yet acknowledged by the client. */
  serializationRepairPending?: boolean
  /** Bounded raw worker output, retained for diagnostics alongside structured ProbeResult. */
  result?: string
  /** Cursor: last collected message id/digest so collect extracts incrementally. */
  lastCollectedMessageId?: string
  /** Short compatibility summary for existing renderers/consumers. */
  error?: string
  /** Structured lifecycle diagnostic; never rely on UnknownError alone. */
  errorDetails?: TeamJobError
  /** Audit trail for an explicit orphan adoption; the old session is never reused. */
  adoptionHistory?: Array<{
    originalAgent?: string
    adoptedAgent: TeamAgent
    adoptedAt: string
    adoptedBySessionID: string
    reason: string
    previousSessionID?: string
  }>
}

export type TeamParentAdoption = {
  previousParentSessionID: string
  adoptedAt: string
  adoptedBySessionID: string
  reason: string
}

export type TeamRun = {
  id: string
  title: string
  parentSessionID: string
  /** Evidence case that owns this run's audit events. */
  caseId?: string
  /** Explicit parent-session rebind audit trail; bounded by the runtime. */
  adoptionHistory?: TeamParentAdoption[]
  status: TeamRunStatus
  createdAt: string
  updatedAt: string
  probes: TeamProbe[]
  jobs: TeamJob[]
  notificationPending: boolean
  notificationSentAt?: string
  notificationError?: string
  outcome?: "solved" | "continue" | "blocked"
  synthesisSummary?: string
  /** Runtime-observable failure labels stamped at close (see failure-attribution.ts). */
  failureAttribution?: { modes: string[]; signals: string[]; at: string }
}

export type TeamState = {
  schemaVersion: 2
  revision: number
  updatedAt: string
  activeRunID?: string
  runs: TeamRun[]
}

export type TeamModel = {
  providerID: string
  modelID: string
}

export type CreateTeamToolsOptions = {
  maxWorkers?: number
  /** Supervisor retry budget: how many deadline exceedances before a worker fails. */
  maxJobAttempts?: number
  runtimeVisibility?: {
    surface?: "ctf-fast" | "ctf-expert"
    pluginToolCount?: number
    expectedSkills?: string[]
    externalSkillsEnabled?: boolean
    exportedToolNames?: string[]
  }
}

export const TEAM_AGENT = "ctf-expert"
export const DEFAULT_MAX_JOBS = 8
export const ABSOLUTE_MAX_JOBS = 16
export const MAX_JOB_RESULT = 6_000
export const MAX_COLLECT_OUTPUT = 32_000
export const STATE_FILE = ".ctf-team.json"
export const STATE_VERSION = 2

export const DEFAULT_JOB_TIMEOUT_MINUTES = 30
export const DEFAULT_MAX_JOB_ATTEMPTS = 2

export function resolveMaxJobAttempts(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return DEFAULT_MAX_JOB_ATTEMPTS
  return Math.min(10, Math.floor(value))
}

export function resolveMaxJobs(maxWorkers?: number): number {
  if (typeof maxWorkers !== "number" || !Number.isFinite(maxWorkers) || maxWorkers <= 0) {
    return DEFAULT_MAX_JOBS
  }
  return Math.min(ABSOLUTE_MAX_JOBS, Math.max(1, Math.floor(maxWorkers)))
}

export function now() {
  return new Date().toISOString()
}

export function safeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause === undefined ? undefined : safeError(error.cause)
    return [`${error.name}: ${error.message}`, cause && `cause=${cause}`].filter(Boolean).join("; ").slice(0, 1_000)
  }
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>
    const name = typeof value.name === "string" ? value.name : undefined
    const message = typeof value.message === "string" ? value.message : undefined
    const data = value.data && typeof value.data === "object" ? (value.data as Record<string, unknown>) : undefined
    const dataMessage = typeof data?.message === "string" ? data.message : undefined
    const responseBody = typeof data?.responseBody === "string" ? data.responseBody : undefined
    const nested = value.error !== error ? value.error : undefined
    const nestedText: string | undefined = nested === undefined ? undefined : safeError(nested)
    const code = typeof value.code === "string" ? value.code : undefined
    const text = [
      name,
      message || dataMessage,
      responseBody && `responseBody=${responseBody}`,
      nestedText,
      code && `code=${code}`,
    ]
      .filter(Boolean)
      .join(": ")
    if (text) return text.slice(0, 1_000)
  }
  return String(error).slice(0, 1_000)
}

export function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "task"
  )
}

export function buildRunId() {
  return `team-${randomUUID()}`
}
