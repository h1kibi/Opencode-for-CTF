import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { randomUUID } from "node:crypto"
import { appendCaseEvent } from "../case-state.ts"
import { activateAgentDefaults } from "../mcp/mcp-runtime-adapter.ts"
import { listPendingRequests } from "../mcp/mcp-runtime-adapter.ts"
import { getSessionSurface } from "../session-surface.ts"
import { readCurrentEvidenceSlug } from "../../scripts/evidence-helper.ts"
import {
  applyTeamCancellation,
  canTransitionTeamJob,
  clearRetryReservation,
  commitTeamRetry,
  failTeamRetry,
  finalizeTeamJob,
  isTerminalTeamJob as isTerminalJob,
  hasTeamRetryReservation,
  recordTeamRetrySession,
  recoverPendingTeamRetry,
  refreshTeamRunStatus,
  reserveTeamRetry,
  transitionTeamJob,
  type TeamRetryFence,
} from "../team-reducer.ts"
import { prepareOrphanJobAdoption, rebindTeamParent } from "../team-adoption-reducer.ts"
import { abortFollowUpSessions, abortOutcomeError, type FollowUpSession } from "./team-cancellation-cleanup.ts"
import { collectWorkerResult } from "./team-worker-packet.ts"
import { classifyRunFailure } from "./failure-attribution.ts"
import { cancelRunsForDeletedParent } from "./parent-session-guard.ts"
import { hasOpenTeamWorker, probeSessionPresence } from "./session-liveness.ts"
import {
  findJobBySession,
  findRun,
  inspectTeamLockState,
  isOrphanedJob,
  normalizePersistedTeamState,
  quarantineTeamState,
  readRawTeamState,
  readTeamState,
  updateTeamState,
} from "./team-state.ts"
import { renderRun, summarizeTeamState } from "./team-render.ts"
import {
  buildRunId,
  DEFAULT_JOB_TIMEOUT_MINUTES,
  resolveMaxJobAttempts,
  TEAM_AGENT,
  TEAM_AGENTS,
  TEAM_ROUTE_IDS,
  now,
  resolveMaxJobs,
  safeError,
  type CreateTeamToolsOptions,
  type TeamAgent,
  type TeamJobError,
  type TeamJobErrorPhase,
  type TeamJobErrorType,
  type TeamModel,
  type TeamEvent,
  type TeamEventType,
  type TeamJob,
  type TeamProbe,
  type TeamRun,
  type TeamRouteId,
} from "./team-types.ts"

interface TeamEventish {
  type: string
  properties?: Record<string, any>
}

function buildUnknownAgentError(unknownAgents: string[]): Error {
  const error = new Error(
    `UnknownAgentError: requested agent(s) ${unknownAgents.join(", ")}; available agents: ${TEAM_AGENTS.join(", ")}; ` +
      "registry source: src/team/team-types.ts (process-start registry).",
  )
  error.name = "UnknownAgentError"
  ;(error as Error & { errorType?: string; agents?: string[] }).errorType = "agent_registry"
  ;(error as Error & { agents?: string[] }).agents = unknownAgents
  return error
}

function requireExpert(agent: string, sessionID?: string) {
  if (agent === TEAM_AGENT) return
  if (sessionID && getSessionSurface(sessionID) === "ctf-expert") return
  throw new Error(
    `${TEAM_AGENT} is the only agent allowed to control Team Mode ` +
      `(got agent=${agent || "unknown"}; if /ctf routed to expert, call ctf-route-plan again or use /ctf-expert).`,
  )
}

// ---------------------------------------------------------------------------
// Supervisor: worker deadline enforcement (pure, unit-testable)
// ---------------------------------------------------------------------------

export type DeadlineVerdict =
  | { action: "none" }
  | { action: "interrupt"; attempt: number; maxAttempts: number }
  | { action: "fail"; attempt: number; maxAttempts: number }

/**
 * Supervisor decision for a worker that may have stalled.
 *
 * Only `running` jobs with an expired `deadlineAt` are acted on: the old
 * session is aborted, then a fenced replacement is started while retry budget
 * remains; the job fails once that budget is exhausted. Non-running, heartbeat-fresh,
 * or deadline-less jobs get `none`.
 */
export function evaluateJobDeadline(
  job: Pick<TeamJob, "status" | "attempt"> & { deadlineAt?: string },
  nowMs: number,
  maxAttempts: number,
): DeadlineVerdict {
  if (job.status !== "running" || !job.deadlineAt) return { action: "none" }
  const deadline = Date.parse(job.deadlineAt)
  if (!Number.isFinite(deadline) || nowMs <= deadline) return { action: "none" }
  const attempt = (job.attempt ?? 0) + 1
  const budget = Math.max(1, maxAttempts)
  return attempt >= budget
    ? { action: "fail", attempt, maxAttempts: budget }
    : { action: "interrupt", attempt, maxAttempts: budget }
}

export function computeJobDeadlineAt(timeoutMs: number | undefined, nowMs = Date.now()): string {
  const safeTimeout =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.floor(timeoutMs)
      : DEFAULT_JOB_TIMEOUT_MINUTES * 60_000
  return new Date(nowMs + safeTimeout).toISOString()
}

export function nextWorkerJobStatus(
  currentStatus: TeamJob["status"],
  sessionStatusType?: string,
): TeamJob["status"] | undefined {
  if (sessionStatusType === "retry") return canTransitionTeamJob(currentStatus, "retrying") ? "retrying" : undefined
  if (sessionStatusType === "error") return canTransitionTeamJob(currentStatus, "failed") ? "failed" : undefined
  if (sessionStatusType === "running") return canTransitionTeamJob(currentStatus, "running") ? "running" : undefined
  return undefined
}

function diagnosticText(value: unknown): string {
  const text = safeError(value)
    .replace(/(authorization|cookie|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/([?&](?:token|key|secret|password|session)[^=]*=)[^&\s]+/gi, "$1[redacted]")
  return text.slice(0, 2_000)
}

function errorProperty(value: unknown, key: "cause" | "stack"): unknown {
  if (!value || typeof value !== "object" || !(key in value)) return undefined
  return (value as Record<string, unknown>)[key]
}

function attachCause(error: Error, cause: unknown) {
  ;(error as Error & { cause?: unknown }).cause = cause
  return error
}

function responseData<T>(response: { data?: T; error?: unknown }, action: string): T {
  if (response?.error)
    throw attachCause(new Error(`${action} failed: ${diagnosticText(response.error)}`), response.error)
  if (response?.data === undefined) throw new Error(`${action} returned no data.`)
  return response.data
}

function assertAccepted(response: { error?: unknown } | undefined, action: string) {
  if (response?.error)
    throw attachCause(new Error(`${action} failed: ${diagnosticText(response.error)}`), response.error)
}

function classifyTeamError(error: unknown, fallback: TeamJobErrorType): TeamJobErrorType {
  const text = diagnosticText(error)
  if (/content was flagged|possible cybersecurity risk|trusted access|safety policy|provider policy/i.test(text)) {
    return "provider_policy"
  }
  if (
    /parent.*model|model.*(unavailable|not found|could not be resolved)|provider.*model.*(missing|unknown)/i.test(text)
  ) {
    return "parent_model"
  }
  if (/unknown\s+agent|agent.*(not|un)registered|registry|allowlist/i.test(text)) return "agent_registry"
  if (/tool|surface|mcp/i.test(text)) return "tool_surface"
  if (/skill/i.test(text)) return "skill_load"
  if (/prompt|injection/i.test(text)) return "prompt_injection"
  if (/serialize|parse|no data|invalid response/i.test(text)) return "serialization"
  if (/heartbeat|timeout|deadline|hung/i.test(text)) return "heartbeat"
  return fallback
}

function buildTeamJobError(
  run: TeamRun,
  job: TeamJob,
  opts: {
    phase: TeamJobErrorPhase
    errorType?: TeamJobErrorType
    error: unknown
    retryable?: boolean
    cause?: unknown
  },
): TeamJobError {
  const raw = diagnosticText(opts.error)
  const message =
    raw === "UnknownError"
      ? `Worker returned UnknownError during ${opts.phase}; no lower-level message was supplied.`
      : raw || `Worker failed during ${opts.phase}.`
  const cause = opts.cause === undefined ? errorProperty(opts.error, "cause") : opts.cause
  const rawStack = opts.error instanceof Error ? opts.error.stack : errorProperty(opts.error, "stack")
  const classifiedType = classifyTeamError(opts.error, opts.errorType ?? "unknown")
  const errorType = classifiedType === "provider_policy" ? classifiedType : (opts.errorType ?? classifiedType)
  return {
    errorType,
    message,
    phase: opts.phase,
    agent: job.orphaned?.originalAgent ?? job.originalAgent ?? job.agent,
    parentSessionID: run.parentSessionID ?? "",
    ...(job.sessionID ? { childSessionID: job.sessionID } : {}),
    jobID: job.id,
    retryable: errorType === "provider_policy" || errorType === "parent_model" ? false : (opts.retryable ?? false),
    timestamp: now(),
    ...(cause === undefined ? {} : { cause: diagnosticText(cause) }),
    ...(rawStack ? { stack: diagnosticText(rawStack) } : {}),
  }
}

function persistTeamJobError(run: TeamRun, job: TeamJob, opts: Parameters<typeof buildTeamJobError>[2]) {
  const details = buildTeamJobError(run, job, opts)
  job.errorDetails = details
  job.error = details.message.slice(0, 1_000)
  return details
}

function failTeamJob(run: TeamRun, job: TeamJob, opts: Parameters<typeof buildTeamJobError>[2]) {
  const details = persistTeamJobError(run, job, opts)
  transitionTeamJob(job, "failed", details.message)
  return details
}

function buildChildSessionTools(
  exportedNames: string[] | undefined,
  overrides: Record<string, boolean> = {},
): Record<string, boolean> {
  const readOnlyCore = ["read", "glob", "grep", "skill"]
  const readOnlyCtf = [
    "ctf-binary-probe",
    "ctf-crypto-analyze",
    "ctf-elf-slice",
    "ctf-memstr",
    "ctf-rev-pe-slice",
    "ctf-web-analyze",
    "ctf-web-blackbox-map",
    "ctf-web-fingerprint",
  ]
  const tools: Record<string, boolean> = {}
  for (const name of [
    ...readOnlyCore,
    ...(exportedNames ?? []),
    "ctf-team-dispatch",
    "ctf-team-status",
    "ctf-team-collect",
    "ctf-team-cancel",
    "ctf-team-cancel-route",
    "ctf-team-close",
    "ctf-team-recover",
    "ctf-team-adopt",
    "ctf-team-repair",
  ]) {
    if (readOnlyCore.includes(name) || readOnlyCtf.includes(name)) tools[name] = true
    if (name.startsWith("ctf-team-")) tools[name] = false
  }
  for (const [name, enabled] of Object.entries(overrides)) {
    if (!enabled || name.startsWith("ctf-team-")) tools[name] = false
  }
  return tools
}

function workerPrompt(
  run: TeamRun,
  job: TeamJob,
  visibility?: {
    surface: "ctf-fast" | "ctf-expert"
    pluginToolCount?: number
    expectedSkills?: string[]
    externalSkillsEnabled?: boolean
  },
) {
  const probe = run.probes.find((candidate) => candidate.id === job.probeId)
  if (!probe) throw new Error(`Worker job ${job.id} has no matching probe ${job.probeId}.`)
  return [
    `You are ${job.agent}, a CTF Team probe worker.`,
    `Run: ${run.title} (${run.id})`,
    `Probe: ${probe.title} (${probe.id})`,
    `Objective: ${probe.objective}`,
    `Authorized route: ${probe.routeId}; concurrency: ${probe.concurrency}.`,
    "Work only within this probe objective and authorized challenge scope supplied by the parent.",
    "Do not delegate or use any ctf-team-* control tool. Do not write Case/Evidence state; the Expert owns those writes.",
    "Do not edit Evidence.md, notes.md, .ctf-state.json, .ctf-team.json, or agent_flag.txt.",
    "If you produce local artifacts, return their paths and concise descriptions.",
    "If a heavy MCP is required, request it through ctf-dynamic-mcp-advisor and wait; do not install tools ad-hoc.",
    visibility ? `Expected runtime surface: ${visibility.surface}` : "",
    visibility ? `Expected plugin-visible tools: ${visibility.pluginToolCount ?? 0}` : "",
    visibility ? `external_skills enabled: ${visibility.externalSkillsEnabled ? "yes" : "no"}` : "",
    visibility && visibility.expectedSkills?.length
      ? `Expected skills catalog entries: ${visibility.expectedSkills.join(", ")}`
      : visibility
        ? "Expected skills catalog entries: (none detected by plugin startup diagnostics)"
        : "",
    "When complete, emit exactly one fenced JSON packet with protocol ctf.team.probe.v1 and type probe_result.",
    "The packet must contain status (completed|blocked|failed), summary, observations (each with kind, statement, evidence [{type,value}]), artifacts, and optional next.",
    "Observations are findings for Expert interpretation, not Case/Evidence writes or claims.",
  ]
    .filter(Boolean)
    .join("\n")
}

const SERIALIZATION_REPAIR_PROMPT =
  "Your previous response was not a valid ctf.team.probe.v1 packet. Reply with only one valid fenced JSON packet using protocol ctf.team.probe.v1 and type probe_result; do not include any other text."

function appendRuntimeNotes(
  base: string,
  repairs: string[],
  lockState: { path: string; present: boolean; fileCount: number },
) {
  const notes: string[] = []
  if (repairs.length) {
    notes.push("state_repairs:")
    notes.push(...repairs.map((repair) => `- ${repair}`))
  }
  if (lockState.present) {
    notes.push(`lock_dir: ${lockState.path}`)
    notes.push(`lock_files: ${lockState.fileCount}`)
  }
  return notes.length ? `${base}\n${notes.join("\n")}` : base
}
async function promptWorkerSession(
  client: OpencodeClient,
  directory: string,
  sessionID: string,
  agent: string,
  model: TeamModel,
  run: TeamRun,
  job: TeamJob,
  exportedToolNames: string[] | undefined,
  visibility: CreateTeamToolsOptions["runtimeVisibility"],
  action: string,
  addendum?: string[],
): Promise<void> {
  const workerVisibility = {
    surface: visibility?.surface ?? "ctf-expert",
    pluginToolCount: visibility?.pluginToolCount,
    expectedSkills: visibility?.expectedSkills,
    externalSkillsEnabled: visibility?.externalSkillsEnabled,
  }
  const response = await client.session.promptAsync({
    path: { id: sessionID },
    query: { directory },
    body: {
      agent,
      model,
      tools: buildChildSessionTools(exportedToolNames, { task: false, edit: false, write: false, apply_patch: false }),
      parts: [
        {
          type: "text",
          text: [workerPrompt(run, job, workerVisibility), ...(addendum ?? [])].filter(Boolean).join("\n"),
        },
      ],
    },
  })
  assertAccepted(response, action)
}

export function createTeamRuntimeCore(
  client: OpencodeClient,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
) {
  const maxJobs = resolveMaxJobs(options.maxWorkers)
  const maxJobAttempts = resolveMaxJobAttempts(options.maxJobAttempts)
  const parentModelCache = new Map<string, TeamModel>()

  function makeTeamEvent(type: TeamEventType, run: TeamRun, extra: Partial<TeamEvent> = {}): TeamEvent {
    return { id: `tev-${randomUUID().slice(0, 12)}`, type, runId: run.id, at: now(), ...extra }
  }

  /**
   * Best-effort audit: mirror team lifecycle events into the evidence case's
   * events.jsonl. A missing/inaccessible case must never fail Team Mode, so
   * every failure is logged and swallowed.
   */
  async function appendTeamEvents(events: TeamEvent[]) {
    if (!events.length) return
    try {
      const state = await readTeamState(directory)
      for (const event of events) {
        const run = findRun(state, event.runId)
        // The run's persisted caseId is authoritative. Never route an event
        // for an existing run through mutable `.current` after a case switch.
        const caseId = run?.caseId
        if (!caseId) continue
        await appendCaseEvent(worktree, caseId, `team.${event.type}`, {
          runId: event.runId,
          ...(event.jobId ? { jobId: event.jobId } : {}),
          ...(event.probeId ? { probeId: event.probeId } : {}),
          ...(event.data ?? {}),
        })
      }
    } catch (error) {
      console.warn("[team-runtime] team event append failed (non-fatal):", safeError(error))
    }
  }

  async function resolveParentModel(parentSessionID: string | undefined): Promise<TeamModel> {
    if (!parentSessionID) {
      const error = new Error(
        "ParentModelUnavailableError: Team workers require the lead session provider/model, but no parent session ID was supplied.",
      )
      error.name = "ParentModelUnavailableError"
      throw error
    }
    const cached = parentModelCache.get(parentSessionID)
    if (cached) return cached
    if (!client.session?.messages) {
      const error = new Error(
        `ParentModelUnavailableError: the session API cannot read provider/model metadata for parent session ${parentSessionID}; no child was created.`,
      )
      error.name = "ParentModelUnavailableError"
      throw error
    }
    try {
      const response = await client.session.messages({
        path: { id: parentSessionID },
        query: { directory, limit: 20 },
      })
      const messages = responseData(response, `Read parent model ${parentSessionID}`) as Array<{
        info?: Record<string, unknown>
      }>
      const assistant = [...messages].reverse().find((message) => message?.info?.role === "assistant")
      const providerID = typeof assistant?.info?.providerID === "string" ? assistant.info.providerID : undefined
      const modelID = typeof assistant?.info?.modelID === "string" ? assistant.info.modelID : undefined
      if (!providerID || !modelID) {
        const error = new Error(
          `ParentModelUnavailableError: could not resolve both providerID and modelID from lead session ${parentSessionID}; no child was created.`,
        )
        error.name = "ParentModelUnavailableError"
        throw error
      }
      const model = { providerID, modelID }
      parentModelCache.set(parentSessionID, model)
      return model
    } catch (cause) {
      if (cause instanceof Error && cause.name === "ParentModelUnavailableError") throw cause
      throw attachCause(
        new Error(
          `ParentModelUnavailableError: failed to read provider/model metadata from lead session ${parentSessionID}; no child was created.`,
        ),
        cause,
      )
    }
  }

  async function collectJob(sessionID: string) {
    const state = await readTeamState(directory)
    const located = findJobBySession(state, sessionID)
    if (!located || isTerminalJob(located.job.status) || located.job.retryPending) return
    try {
      const response = await client.session.messages({ path: { id: sessionID }, query: { directory, limit: 20 } })
      const collected = collectWorkerResult(
        responseData(response, `Collect worker ${sessionID}`),
        located.job.lastCollectedMessageId,
      )

      if (
        collected.serializationError &&
        located.job.serializationRepairPending &&
        (!collected.lastMessageID || collected.lastMessageID === located.job.lastCollectedMessageId)
      )
        return
      if (collected.serializationError) {
        let reserved = false
        let repairAlreadyPending = false
        await updateTeamState(directory, (draft) => {
          const current = findJobBySession(draft, sessionID)
          if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
          repairAlreadyPending = current.job.serializationRepairPending === true
          if (repairAlreadyPending || (current.job.serializationRepairAttempts ?? 0) >= 1) return
          reserved = true
          current.job.serializationRepairAttempts = (current.job.serializationRepairAttempts ?? 0) + 1
          current.job.serializationRepairPending = true
          if (collected.lastMessageID) current.job.lastCollectedMessageId = collected.lastMessageID
          current.job.result = collected.result
          current.job.updatedAt = now()
        })
        if (!reserved) {
          if (repairAlreadyPending) {
            await updateTeamState(directory, (draft) => {
              const current = findJobBySession(draft, sessionID)
              if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
              current.job.serializationRepairPending = false
              failTeamJob(current.run, current.job, {
                phase: "collect",
                errorType: "serialization",
                error: "Serialization repair reservation was already consumed without a valid packet.",
                retryable: false,
              })
              finalizeTeamJob(current.run, current.job)
            })
            return
          }
          await updateTeamState(directory, (draft) => {
            const current = findJobBySession(draft, sessionID)
            if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
            current.job.serializationRepairPending = false
            failTeamJob(current.run, current.job, {
              phase: "collect",
              errorType: "serialization",
              error: collected.serializationError,
              retryable: false,
            })
            finalizeTeamJob(current.run, current.job)
          })
          return
        }

        try {
          const repairResponse = await client.session.promptAsync({
            path: { id: sessionID },
            query: { directory },
            body: { parts: [{ type: "text", text: SERIALIZATION_REPAIR_PROMPT }] },
          })
          assertAccepted(repairResponse, `Repair worker serialization ${sessionID}`)
        } catch (error) {
          await updateTeamState(directory, (draft) => {
            const current = findJobBySession(draft, sessionID)
            if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
            current.job.serializationRepairPending = false
            failTeamJob(current.run, current.job, {
              phase: "collect",
              errorType: "serialization",
              error: `Serialization repair failed: ${safeError(error)}`,
              retryable: false,
            })
            finalizeTeamJob(current.run, current.job)
          })
        }
        return
      }

      const auditEvents: TeamEvent[] = []
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, sessionID)
        if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
        current.job.serializationRepairPending = false
        current.job.updatedAt = now()
        if (collected.lastMessageID) current.job.lastCollectedMessageId = collected.lastMessageID
        current.job.finishedAt = now()
        const probe = current.run.probes.find((candidate) => candidate.id === current.job.probeId)
        if (collected.error) {
          failTeamJob(current.run, current.job, {
            phase: "collect",
            errorType: "worker_runtime",
            error: collected.error,
            retryable: false,
          })
        } else if (!probe || !collected.packet || collected.packet.status === "failed") {
          const reason = !probe
            ? `Job ${current.job.id} has no matching probe ${current.job.probeId}.`
            : collected.packet?.summary || "Worker did not return a valid ctf.team.probe.v1 probe_result packet."
          failTeamJob(current.run, current.job, {
            phase: "collect",
            errorType: "serialization",
            error: reason,
            retryable: false,
          })
          if (probe) {
            probe.status = "failed"
            probe.result = collected.packet
            probe.updatedAt = now()
            auditEvents.push(
              makeTeamEvent("probe_failed", current.run, {
                probeId: probe.id,
                jobId: current.job.id,
                data: { summary: collected.packet?.summary ?? reason },
              }),
            )
          }
        } else {
          transitionTeamJob(current.job, "completed")
          current.job.result = collected.result
          probe.result = collected.packet
          probe.status = collected.packet.status
          probe.updatedAt = now()
          auditEvents.push(
            makeTeamEvent(collected.packet.status === "blocked" ? "probe_blocked" : "probe_completed", current.run, {
              probeId: probe.id,
              jobId: current.job.id,
              data: { summary: collected.packet.summary },
            }),
          )
        }
        refreshTeamRunStatus(current.run)
      })
      await appendTeamEvents(auditEvents)
    } catch (error) {
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, sessionID)
        if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
        current.job.serializationRepairPending = false
        failTeamJob(current.run, current.job, { phase: "collect", errorType: "serialization", error, retryable: true })
        finalizeTeamJob(current.run, current.job)
      })
    }
  }

  async function parentIsIdle(parentSessionID: string) {
    const response = await client.session.status({ query: { directory } })
    const statuses = responseData(response, "Read session status") as Record<string, { type: string; attempt?: number }>
    return !statuses[parentSessionID] || statuses[parentSessionID].type === "idle"
  }

  async function notifyParent(runID: string) {
    const state = await readTeamState(directory)
    const run = findRun(state, runID)
    if (!run || !run.notificationPending || run.notificationSentAt) return
    try {
      if (!(await parentIsIdle(run.parentSessionID))) return
    } catch (error) {
      await updateTeamState(directory, (draft) => {
        const current = findRun(draft, runID)
        if (!current || !current.notificationPending || current.notificationSentAt) return
        current.notificationError = safeError(error)
      })
      return
    }
    let notificationReserved = false
    await updateTeamState(directory, (draft) => {
      const current = findRun(draft, runID)
      if (!current || !current.notificationPending || current.notificationSentAt) return
      current.notificationPending = false
      current.notificationSentAt = now()
      current.notificationError = undefined
      notificationReserved = true
    })
    if (!notificationReserved) return
    try {
      let mcpHint = ""
      try {
        const pending = await listPendingRequests(worktree)
        if (pending.length) {
          mcpHint =
            `\n\n⚠️ ${pending.length} MCP request(s) PENDING — call ctf-mcp-control action=list-pending ` +
            `then approve/deny NOW before the next dispatch so workers are not already finished.`
          for (const p of pending.slice(0, 6)) {
            mcpHint += `\n  - ${p.id} agent=${p.agent} mcp=${p.serverName} reason="${p.reason}"`
          }
        }
      } catch {
        // non-fatal
      }
      const response = await client.session.promptAsync({
        path: { id: run.parentSessionID },
        query: { directory },
        body: {
          agent: TEAM_AGENT,
          tools: { task: false },
          parts: [
            {
              type: "text",
              text:
                `CTF Team Mode run ${run.id} has completed probe workers. Call ctf-team-collect ` +
                `to review probe_result observations, update Case/Evidence as Expert, then close, cancel other routes, or dispatch another probe wave.` +
                mcpHint,
            },
          ],
        },
      })
      assertAccepted(response, "Notify CTF expert")
    } catch (error) {
      await updateTeamState(directory, (draft) => {
        const current = findRun(draft, runID)
        if (!current) return
        current.notificationPending = true
        current.notificationSentAt = undefined
        current.notificationError = safeError(error)
      })
    }
  }

  /**
   * Replace a worker whose hard deadline expired. The old session is aborted
   * before a replacement is created, and the persisted job is fenced by its
   * old session/owner token so stale events cannot overwrite the retry.
   */
  async function retryExpiredWorker(
    runID: string,
    jobID: string,
    oldSessionID: string,
    ownerToken: string | undefined,
    verdict: Extract<DeadlineVerdict, { action: "interrupt" }>,
    run: TeamRun,
    job: TeamJob,
  ) {
    const retryOwnerToken = randomUUID().slice(0, 8)
    const retryFence: TeamRetryFence = {
      runID,
      jobID,
      oldSessionID,
      expectedOwnerToken: ownerToken,
      retryOwnerToken,
      attempt: verdict.attempt,
    }
    let reserved = false
    await updateTeamState(directory, (draft) => {
      const current = findJobBySession(draft, oldSessionID)
      if (!current) return
      reserved = reserveTeamRetry(current.run, current.job, retryFence)
    })
    if (!reserved) return

    let oldAbortError: string | undefined
    try {
      const response = await client.session.abort({
        path: { id: oldSessionID },
        query: { directory },
      })
      oldAbortError = response?.error ? safeError(response.error) : undefined
    } catch (error) {
      oldAbortError = safeError(error)
    }

    if (oldAbortError) {
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, oldSessionID)
        if (!current || !hasTeamRetryReservation(current.run, current.job, retryFence)) return
        const error = `Worker deadline exceeded (attempt ${verdict.attempt}/${verdict.maxAttempts}); abort failed: ${oldAbortError}`
        persistTeamJobError(current.run, current.job, {
          phase: "running",
          errorType: "heartbeat",
          error,
          retryable: true,
        })
        failTeamRetry(current.run, current.job, retryFence, {
          status: "cancel_failed",
          message: current.job.errorDetails?.message ?? error,
          oldSessionAbortSucceeded: false,
        })
      })
      return
    }

    const afterAbort = await readTeamState(directory)
    const reservedJob = findJobBySession(afterAbort, oldSessionID)
    if (!reservedJob || !hasTeamRetryReservation(reservedJob.run, reservedJob.job, retryFence)) return

    let replacementSessionID: string | undefined
    let parentModel: TeamModel
    try {
      parentModel = await resolveParentModel(run.parentSessionID)
      const probe = run.probes.find((candidate) => candidate.id === job.probeId)
      if (!probe) throw new Error(`Retry job ${job.id} has no matching probe ${job.probeId}.`)
      const created = await client.session.create({
        query: { directory },
        body: { parentID: run.parentSessionID, title: `[CTF Team Retry ${verdict.attempt}] ${probe.title}` },
      })
      const createdData = responseData(created, `Create retry worker ${jobID}`) as { id?: unknown }
      if (typeof createdData.id !== "string" || !createdData.id) {
        throw new Error(`Create retry worker ${jobID} returned an invalid session id.`)
      }
      replacementSessionID = createdData.id
      let replacementRecorded = false
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, oldSessionID)
        if (!current) return
        replacementRecorded = recordTeamRetrySession(current.run, current.job, retryFence, replacementSessionID!)
      })
      if (!replacementRecorded) throw new Error("Retry ownership was lost before replacement startup.")

      let mcp = { activated: [] as string[], skipped: [] as string[], error: undefined as string | undefined }
      try {
        const result = await activateAgentDefaults({
          client,
          worktree,
          directory,
          sessionID: replacementSessionID,
          agentName: job.agent,
        })
        mcp = { activated: result.activated, skipped: result.skipped, error: undefined }
      } catch (error) {
        mcp.error = safeError(error)
      }

      await promptWorkerSession(
        client,
        directory,
        replacementSessionID,
        job.agent,
        parentModel,
        run,
        job,
        options.runtimeVisibility?.exportedToolNames,
        options.runtimeVisibility,
        `Start retry worker ${jobID}`,
        [
          `This is bounded retry attempt ${verdict.attempt}/${verdict.maxAttempts} after the previous worker exceeded its deadline.`,
          `Default MCP profile: activated=${mcp.activated.length ? mcp.activated.join(", ") : "(none)"}; skipped=${mcp.skipped.join("; ")}${mcp.error ? `; activation_error=${mcp.error}` : ""}`,
        ],
      )
    } catch (error) {
      let replacementAbortError: string | undefined
      if (replacementSessionID) {
        try {
          const response = await client.session.abort({
            path: { id: replacementSessionID },
            query: { directory },
          })
          replacementAbortError = response?.error ? safeError(response.error) : undefined
        } catch (abortError) {
          replacementAbortError = safeError(abortError)
        }
      }
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, oldSessionID)
        if (!current || !hasTeamRetryReservation(current.run, current.job, retryFence)) return
        const retryFailure = replacementAbortError
          ? `Deadline retry worker failed to start: ${safeError(error)}; replacement abort failed: ${replacementAbortError}`
          : `Deadline retry worker failed to start: ${safeError(error)}`
        persistTeamJobError(current.run, current.job, {
          phase: "session_start",
          errorType: classifyTeamError(error, "child_session_startup"),
          error: retryFailure,
          retryable: true,
        })
        failTeamRetry(current.run, current.job, retryFence, {
          status: replacementAbortError ? "cancel_failed" : "failed",
          message: current.job.errorDetails?.message ?? retryFailure,
          replacementSessionID,
          oldSessionAbortSucceeded: true,
        })
      })
      return
    }

    let probeStartedEvent: TeamEvent | undefined
    let committed = false
    const startedAt = now()
    const deadlineAt = computeJobDeadlineAt(job.timeoutMs, Date.parse(startedAt))
    await updateTeamState(directory, (draft) => {
      const current = findJobBySession(draft, oldSessionID)
      if (!current) return
      committed = commitTeamRetry(current.run, current.job, retryFence, replacementSessionID!, startedAt, deadlineAt)
      if (committed) {
        probeStartedEvent = makeTeamEvent("probe_started", current.run, {
          probeId: current.job.probeId,
          jobId: current.job.id,
        })
      }
    })

    if (committed && probeStartedEvent) await appendTeamEvents([probeStartedEvent])
    // If another lifecycle operation won the fence while the replacement was
    // starting, do not leak the newly-created session.
    if (!committed && replacementSessionID) {
      try {
        await client.session.abort({
          path: { id: replacementSessionID },
          query: { directory },
        })
      } catch {
        // Best effort only; the persisted owner fence remains authoritative.
      }
    }
  }

  async function retryFailedCancellations(runID?: string) {
    const state = await readTeamState(directory)
    const runs = runID ? ([findRun(state, runID)].filter(Boolean) as TeamRun[]) : state.runs
    const pending = runs.flatMap((run) =>
      run.jobs
        .filter((job) => job.status === "cancel_failed" && job.sessionID)
        .map((job) => ({ runID: run.id, jobID: job.id, sessionID: job.sessionID! })),
    )
    if (!pending.length) return

    const aborts = await Promise.allSettled(
      pending.map((item) =>
        client.session.abort({
          path: { id: item.sessionID },
          query: { directory },
        }),
      ),
    )
    await updateTeamState(directory, (draft) => {
      for (const [index, item] of pending.entries()) {
        const run = findRun(draft, item.runID)
        const job = run?.jobs.find((candidate) => candidate.id === item.jobID)
        if (!run || !job || job.status !== "cancel_failed") continue
        const abortError = abortOutcomeError(aborts[index])
        if (!abortError) {
          transitionTeamJob(job, "cancelled", "Cancellation retry succeeded during Team recovery.")
        } else {
          transitionTeamJob(job, "cancel_failed", `Cancellation retry failed: ${abortError}`)
        }
        clearRetryReservation(job)
        job.finishedAt = now()
        job.updatedAt = now()
        refreshTeamRunStatus(run)
      }
      for (const runID of new Set(pending.map((item) => item.runID))) {
        const run = findRun(draft, runID)
        if (!run || !run.jobs.length || !run.jobs.every((job) => job.status === "cancelled")) continue
        run.status = "cancelled"
        run.notificationPending = false
        run.notificationError = undefined
        run.updatedAt = now()
        if (draft.activeRunID === run.id) draft.activeRunID = undefined
      }
    })
  }

  async function reconcile(runID?: string, shouldNotify = false) {
    const state = await readTeamState(directory)
    const runs = runID ? ([findRun(state, runID)].filter(Boolean) as TeamRun[]) : state.runs
    const hasSessions = runs.some((run) => run.jobs.some((job) => job.sessionID && !isTerminalJob(job.status)))
    let statuses: Record<string, { type: string; attempt?: number }> = {}
    if (hasSessions) {
      const response = await client.session.status({ query: { directory } })
      statuses = responseData(response, "Read session status") as Record<string, { type: string; attempt?: number }>
    }
    const refreshed = await readTeamState(directory)
    const currentRuns = runID ? ([findRun(refreshed, runID)].filter(Boolean) as TeamRun[]) : refreshed.runs
    if (!currentRuns.some((run) => run.jobs.some((job) => job.sessionID && !isTerminalJob(job.status)))) {
      if (shouldNotify) for (const run of currentRuns) await notifyParent(run.id)
      return
    }
    for (const run of currentRuns) {
      const pendingStatusUpdates: Array<
        | { kind: "heartbeat"; runID: string; jobID: string; sessionID: string }
        | { kind: "retry"; runID: string; jobID: string; sessionID: string; attempt?: number }
      > = []
      // Flush before any external lifecycle call so its fenced commit observes the latest poll state.
      const flushStatusUpdates = async () => {
        if (!pendingStatusUpdates.length) return
        const updates = pendingStatusUpdates.splice(0)
        await updateTeamState(directory, (draft) => {
          for (const update of updates) {
            const current = findJobBySession(draft, update.sessionID)
            if (
              !current ||
              current.run.id !== update.runID ||
              current.job.id !== update.jobID ||
              isTerminalJob(current.job.status)
            ) {
              continue
            }
            if (update.kind === "heartbeat") {
              if (current.job.status !== "running") continue
              current.job.lastHeartbeatAt = now()
              current.job.updatedAt = now()
              continue
            }
            transitionTeamJob(current.job, "retrying")
            current.job.retryAttempt = update.attempt
            current.job.updatedAt = now()
            refreshTeamRunStatus(current.run)
          }
        })
      }
      for (const job of run.jobs) {
        if (!job.sessionID || isTerminalJob(job.status) || job.retryPending) continue
        const status = statuses[job.sessionID]
        const verdict = evaluateJobDeadline(job, Date.now(), maxJobAttempts)
        if (verdict.action !== "none") {
          await flushStatusUpdates()
          if (verdict.action === "interrupt") {
            await retryExpiredWorker(run.id, job.id, job.sessionID, job.ownerToken, verdict, run, job)
          } else {
            let abortError: string | undefined
            try {
              const abortOutcome = await client.session.abort({ path: { id: job.sessionID }, query: { directory } })
              abortError = abortOutcome?.error ? safeError(abortOutcome.error) : undefined
            } catch (error) {
              abortError = safeError(error)
            }
            await updateTeamState(directory, (draft) => {
              const current = findJobBySession(draft, job.sessionID!)
              if (!current || isTerminalJob(current.job.status)) return
              current.job.attempt = verdict.attempt
              current.job.abortRequestedAt = now()
              current.job.abortSucceededAt = abortError ? undefined : now()
              current.job.deadlineAt = undefined
              current.job.lastHeartbeatAt = undefined
              const deadlineFailure = abortError
                ? `Worker deadline exceeded (attempt ${verdict.attempt}/${verdict.maxAttempts}); abort failed: ${abortError}`
                : `Worker deadline exceeded after ${verdict.attempt} attempt(s); retry budget exhausted`
              persistTeamJobError(current.run, current.job, {
                phase: "running",
                errorType: "heartbeat",
                error: deadlineFailure,
                retryable: Boolean(abortError),
                cause: abortError,
              })
              transitionTeamJob(current.job, abortError ? "cancel_failed" : "failed", deadlineFailure)
              current.job.finishedAt = now()
              current.job.updatedAt = now()
              refreshTeamRunStatus(current.run)
            })
          }
          continue
        }
        if (job.status === "running" && status?.type === "running") {
          const last = job.lastHeartbeatAt ? Date.parse(job.lastHeartbeatAt) : 0
          if (!Number.isFinite(last) || Date.now() - last > 60_000) {
            pendingStatusUpdates.push({ kind: "heartbeat", runID: run.id, jobID: job.id, sessionID: job.sessionID })
          }
          continue
        }
        if (!status) {
          await flushStatusUpdates()
          const presence = await probeSessionPresence(client, directory, job.sessionID)
          if (presence === "absent") {
            await updateTeamState(directory, (draft) => {
              const current = findJobBySession(draft, job.sessionID!)
              if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
              const phase = current.job.status === "starting" ? "session_start" : "running"
              failTeamJob(current.run, current.job, {
                phase,
                errorType: current.job.status === "starting" ? "child_session_startup" : "worker_runtime",
                error: `Worker child session ${job.sessionID} is absent from the session registry.`,
                retryable: true,
              })
              current.job.finishedAt = now()
              current.job.updatedAt = now()
              refreshTeamRunStatus(current.run)
            })
          }
        } else if (status.type === "idle") {
          await flushStatusUpdates()
          await collectJob(job.sessionID)
        } else if (status.type === "retry") {
          pendingStatusUpdates.push({
            kind: "retry",
            runID: run.id,
            jobID: job.id,
            sessionID: job.sessionID,
            attempt: status.attempt,
          })
        }
      }
      await flushStatusUpdates()
      if (shouldNotify) await notifyParent(run.id)
    }
  }

  function runCanBeAutoArchived(run: TeamRun): boolean {
    // Never hide a live, valid worker. A run is safe to isolate when all jobs
    // are terminal/orphaned; this covers stale sessions from an older plugin
    // build without guessing an agent identity.
    return run.jobs.some(isOrphanedJob) && run.jobs.every((job) => isTerminalJob(job.status) || isOrphanedJob(job))
  }

  const tools: Record<string, ToolDefinition> = {
    "ctf-team-repair": tool({
      description:
        "Inspect and repair stale CTF Team state. Unknown-agent jobs are shown as orphaned; cancel_orphans aborts recoverable sessions; quarantine/reset preserves the original state file before creating a fresh state.",
      args: {
        operation: tool.schema
          .enum(["inspect", "cancel_orphans", "quarantine", "reset"])
          .describe("inspect | cancel_orphans | quarantine | reset"),
        runID: tool.schema.string().optional(),
        force: tool.schema.boolean().optional().describe("Required for reset."),
        reason: tool.schema.string().max(1_000).optional(),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const reason = args.reason?.trim() || "explicit Team state repair"
        if (args.operation === "quarantine" || args.operation === "reset") {
          if (args.operation === "reset" && (!args.force || !args.reason?.trim())) {
            throw new Error("ctf-team-repair reset requires force=true and a non-empty reason.")
          }
          const result = await quarantineTeamState(directory, reason)
          return JSON.stringify({ ok: true, operation: args.operation, ...result, next: "ctf-team-dispatch" }, null, 2)
        }

        let state
        try {
          state = await readTeamState(directory)
        } catch (error) {
          const raw = await readRawTeamState(directory).catch(() => undefined)
          return JSON.stringify(
            {
              ok: false,
              operation: args.operation,
              stateReadable: false,
              error: safeError(error),
              rawStatePresent: raw !== undefined,
              repairCommands: [
                'ctf-team-repair operation=quarantine reason="preserve corrupt Team state"',
                'ctf-team-repair operation=reset force=true reason="reset corrupt Team state"',
              ],
            },
            null,
            2,
          )
        }
        const runs = args.runID ? ([findRun(state, args.runID)].filter(Boolean) as TeamRun[]) : state.runs
        if (args.operation === "inspect") {
          const orphaned = runs.flatMap((run) =>
            run.jobs.filter(isOrphanedJob).map((job) => ({
              runID: run.id,
              runTitle: run.title,
              jobID: job.id,
              state: "orphaned",
              reason: job.orphaned?.reason || "unknown_agent",
              originalAgent: job.orphaned?.originalAgent || job.originalAgent,
              sessionID: job.sessionID,
              recoverable: job.orphaned?.recoverable ?? true,
              status: job.status,
              error: job.error,
              errorDetails: job.errorDetails,
            })),
          )
          return JSON.stringify(
            {
              ok: true,
              operation: args.operation,
              stateReadable: true,
              orphaned,
              runs: runs.map((run) => ({ id: run.id, status: run.status, jobs: run.jobs.length })),
              repairCommands: orphaned.length
                ? [
                    "ctf-team-repair operation=cancel_orphans",
                    'ctf-team-repair operation=quarantine reason="archive stale Team run"',
                  ]
                : [],
            },
            null,
            2,
          )
        }

        const targets = runs.flatMap((run) =>
          run.jobs.filter(isOrphanedJob).map((job) => ({ runID: run.id, jobID: job.id, sessionID: job.sessionID })),
        )
        const aborts = await Promise.allSettled(
          targets
            .filter((item) => item.sessionID)
            .map((item) => client.session.abort({ path: { id: item.sessionID! }, query: { directory } })),
        )
        let abortIndex = 0
        await updateTeamState(directory, (draft) => {
          for (const target of targets) {
            const located = findRun(draft, target.runID)
            const job = located?.jobs.find((candidate) => candidate.id === target.jobID)
            if (!job || !isOrphanedJob(job)) continue
            const result = target.sessionID ? aborts[abortIndex++] : undefined
            const abortError = target.sessionID ? abortOutcomeError(result) : undefined
            if (abortError) {
              job.error = `${reason}; abort failed: ${abortError}`
              job.orphaned = {
                ...(job.orphaned || { state: "orphaned", reason: "unknown_agent", recoverable: true }),
                recoverable: true,
              }
            } else {
              job.status = "cancelled"
              job.error = `${reason}; orphaned worker quarantined`
              job.finishedAt = now()
              job.updatedAt = now()
              if (job.orphaned) job.orphaned.recoverable = false
            }
            if (
              located &&
              runCanBeAutoArchived(located) &&
              !located.jobs.some((candidate) => !isTerminalJob(candidate.status)) &&
              !located.jobs.some((candidate) => isOrphanedJob(candidate) && candidate.orphaned?.recoverable)
            ) {
              located.status = "cancelled"
              located.notificationPending = false
              located.synthesisSummary = `${reason}; stale/orphaned workers isolated`
              if (draft.activeRunID === located.id) draft.activeRunID = undefined
            }
          }
        })
        return JSON.stringify(
          { ok: true, operation: args.operation, targeted: targets.length, state: await readTeamState(directory) },
          null,
          2,
        )
      },
    }),
    "ctf-team-dispatch": tool({
      description:
        `CTF Expert Team Mode: create and concurrently start 1-${maxJobs} authorized probe worker session(s). ` +
        "Each probe MUST bind routeId (recon|R1|R2|R3|general). Shared-state probes should not share mutable targets. Only ctf-expert (or /ctf expert surface).",
      args: {
        title: tool.schema.string().min(1).max(160).describe("Name of this parallel investigation wave"),
        probes: tool.schema
          .array(
            tool.schema.object({
              title: tool.schema.string().min(1).max(160),
              objective: tool.schema.string().min(1).max(8_000),
              agent: tool.schema.string().min(1).max(80),
              routeId: tool.schema.enum(TEAM_ROUTE_IDS as unknown as [string, ...string[]]),
              concurrency: tool.schema.enum(["independent", "shared_state"]).optional(),
            }),
          )
          .min(1)
          .max(maxJobs),
        timeoutMinutes: tool.schema
          .number()
          .optional()
          .describe(
            `Hard per-worker deadline in minutes (default ${DEFAULT_JOB_TIMEOUT_MINUTES}); timed-out workers are replaced within the bounded retry budget.`,
          ),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const requestedAgents = [...new Set(args.probes.map((probe) => probe.agent))]
        const unknownAgents = requestedAgents.filter((agent) => !(TEAM_AGENTS as readonly string[]).includes(agent))
        if (unknownAgents.length) throw buildUnknownAgentError(unknownAgents)
        const routeCounts = new Map<string, number>()
        for (const probe of args.probes) routeCounts.set(probe.routeId, (routeCounts.get(probe.routeId) ?? 0) + 1)
        for (const routeId of ["R1", "R2", "R3"] as const) {
          if ((routeCounts.get(routeId) ?? 0) > 2) throw new Error(`Too many probes bound to ${routeId} (max 2).`)
        }
        const parentModel = await resolveParentModel(context.sessionID)
        const timeoutMs = Math.min(360, Math.max(1, args.timeoutMinutes ?? DEFAULT_JOB_TIMEOUT_MINUTES)) * 60_000
        const runID = buildRunId()
        const createdAt = now()
        const probes: TeamProbe[] = args.probes.map((probe, index) => ({
          id: `probe-${index + 1}-${randomUUID().slice(0, 8)}`,
          title: probe.title,
          objective: probe.objective,
          agent: probe.agent as TeamAgent,
          routeId: probe.routeId as TeamRouteId,
          concurrency: probe.concurrency ?? "independent",
          status: "queued",
          createdAt,
          updatedAt: createdAt,
        }))
        const jobs: TeamJob[] = probes.map((probe, index) => ({
          id: `job-${index + 1}-${probe.id}`,
          probeId: probe.id,
          agent: probe.agent,
          status: "queued",
          createdAt,
          updatedAt: createdAt,
          timeoutMs,
          attempt: 0,
          ownerToken: randomUUID().slice(0, 8),
        }))
        const run: TeamRun = {
          id: runID,
          title: args.title,
          parentSessionID: context.sessionID,
          caseId: readCurrentEvidenceSlug(worktree) ?? undefined,
          status: "dispatching",
          createdAt,
          updatedAt: createdAt,
          probes,
          jobs,
          notificationPending: false,
        }
        await updateTeamState(directory, (state) => {
          const active = findRun(state)
          if (active && !["completed", "cancelled"].includes(active.status)) {
            if (!runCanBeAutoArchived(active))
              throw new Error(`Team run ${active.id} is still ${active.status}; collect/cancel it first.`)
            active.status = active.jobs.some((job) => isOrphanedJob(job) && job.orphaned?.recoverable)
              ? "degraded"
              : "cancelled"
            active.notificationPending = active.status === "degraded"
            active.notificationSentAt = undefined
            active.synthesisSummary = `Automatically isolated stale Team run before dispatch: ${active.id}`
            active.updatedAt = now()
            if (state.activeRunID === active.id) state.activeRunID = undefined
          }
          state.runs.push(run)
          if (state.runs.length > 20) state.runs = state.runs.slice(-20)
          state.activeRunID = run.id
        })
        await appendTeamEvents(
          probes.map((probe) =>
            makeTeamEvent("probe_created", run, {
              probeId: probe.id,
              data: { routeId: probe.routeId, title: probe.title, objective: probe.objective },
            }),
          ),
        )
        const creations = await Promise.allSettled(
          jobs.map((job) => {
            const probe = probes.find((candidate) => candidate.id === job.probeId)!
            return client.session.create({
              query: { directory },
              body: { parentID: context.sessionID, title: `[CTF Probe] ${probe.title}` },
            })
          }),
        )
        await updateTeamState(directory, (state) => {
          const current = findRun(state, run.id)
          if (!current) throw new Error(`Team run ${run.id} disappeared during worker session creation.`)
          creations.forEach((result, index) => {
            const job = current.jobs[index]
            if (result.status === "rejected") {
              failTeamJob(current, job, {
                phase: "session_create",
                errorType: "child_session_startup",
                error: result.reason,
                retryable: true,
              })
              job.finishedAt = now()
              return
            }
            try {
              const data = responseData(result.value, `Create worker ${job.id}`) as { id?: unknown }
              if (typeof data.id !== "string" || !data.id)
                throw new Error(`Create worker ${job.id} returned an invalid session id.`)
              job.sessionID = data.id
              job.status = "starting"
              job.updatedAt = now()
            } catch (error) {
              failTeamJob(current, job, {
                phase: "session_create",
                errorType: "child_session_startup",
                error,
                retryable: true,
              })
              job.finishedAt = now()
            }
          })
          refreshTeamRunStatus(current)
        })
        const created = findRun(await readTeamState(directory), run.id)!
        const candidates = created.jobs.filter((job) => job.sessionID && job.status === "starting")
        const activations = await Promise.allSettled(
          candidates.map((job) =>
            activateAgentDefaults({ client, worktree, directory, sessionID: job.sessionID!, agentName: job.agent }),
          ),
        )
        const starts = await Promise.allSettled(
          candidates.map(async (job, index) => {
            const activation = activations[index]
            if (activation.status === "rejected") throw activation.reason
            await promptWorkerSession(
              client,
              directory,
              job.sessionID!,
              job.agent,
              parentModel,
              created,
              job,
              options.runtimeVisibility?.exportedToolNames,
              options.runtimeVisibility,
              `Start worker ${job.id}`,
            )
            return job.id
          }),
        )
        const failures = new Map(
          starts.flatMap((result, index) =>
            result.status === "rejected" ? [[candidates[index].id, result.reason] as const] : [],
          ),
        )
        const failedCandidates = candidates.filter((_, index) => starts[index]?.status === "rejected")
        const cleanupResults = await Promise.allSettled(
          failedCandidates.map(async (job) => {
            const response = await client.session.abort({ path: { id: job.sessionID! }, query: { directory } })
            if (response && typeof response === "object" && "error" in response && response.error) {
              throw new Error(`Abort failed: ${safeError(response.error)}`)
            }
          }),
        )
        const cleanupErrors = new Map(
          cleanupResults.flatMap((result, index) =>
            result.status === "rejected" ? [[failedCandidates[index].id, safeError(result.reason)] as const] : [],
          ),
        )
        const startedIDs = new Set(
          starts
            .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
            .map((result) => result.value),
        )
        const startedEvents: TeamEvent[] = []
        await updateTeamState(directory, (state) => {
          const current = findRun(state, run.id)!
          for (const job of current.jobs) {
            const probe = current.probes.find((candidate) => candidate.id === job.probeId)
            if (startedIDs.has(job.id)) {
              transitionTeamJob(job, "running")
              job.startedAt = now()
              job.deadlineAt = computeJobDeadlineAt(job.timeoutMs, Date.parse(job.startedAt))
              job.lastHeartbeatAt = job.startedAt
              job.updatedAt = job.startedAt
              if (probe) {
                probe.status = "running"
                probe.updatedAt = job.startedAt
                startedEvents.push(makeTeamEvent("probe_started", current, { probeId: probe.id, jobId: job.id }))
              }
            } else if (job.status === "starting") {
              const cleanupError = cleanupErrors.get(job.id)
              const error = failures.get(job.id) ?? "Worker start failed"
              const combinedError = cleanupError ? `${safeError(error)}; ${cleanupError}` : error
              persistTeamJobError(current, job, {
                phase: "prompt_injection",
                errorType: classifyTeamError(error, "prompt_injection"),
                error: combinedError,
                retryable: true,
              })
              transitionTeamJob(job, "failed", job.errorDetails?.message)
              job.finishedAt = now()
              if (probe) {
                probe.status = "failed"
                probe.updatedAt = now()
              }
            }
          }
          refreshTeamRunStatus(current)
        })
        await appendTeamEvents(startedEvents)
        const dispatched = findRun(await readTeamState(directory), run.id)!
        return { title: "CTF probes dispatched", output: renderRun(dispatched), metadata: { runID: run.id } }
      },
    }),

    "ctf-team-status": tool({
      description: "Read persisted CTF Team Mode run and worker lifecycle status.",
      args: { runID: tool.schema.string().optional() },
      async execute(args) {
        try {
          const { state, repairs } = await normalizePersistedTeamState(directory)
          const run = findRun(state, args.runID)
          if (!run) return "No matching CTF team run."
          return appendRuntimeNotes(renderRun(run), repairs, await inspectTeamLockState(directory))
        } catch (error) {
          const raw = await readRawTeamState(directory).catch(() => undefined)
          return JSON.stringify(
            {
              ok: false,
              stateReadable: false,
              error: safeError(error),
              rawStatePresent: raw !== undefined,
              repairCommands: [
                "ctf-team-repair operation=inspect",
                'ctf-team-repair operation=quarantine reason="preserve corrupt Team state"',
                'ctf-team-repair operation=reset force=true reason="reset corrupt Team state"',
              ],
            },
            null,
            2,
          )
        }
      },
    }),

    "ctf-team-collect": tool({
      description:
        "Reconcile worker sessions and collect bounded evidence/results from a CTF Team Mode run for expert synthesis.",
      args: { runID: tool.schema.string().optional() },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        await reconcile(args.runID, false)
        const state = await readTeamState(directory)
        const run = findRun(state, args.runID)
        if (!run) return "No matching CTF team run."
        return renderRun(run, true)
      },
    }),

    "ctf-team-cancel": tool({
      description: "Abort every unfinished worker in a CTF Team Mode run and persist cancellation state.",
      args: {
        runID: tool.schema.string().optional(),
        reason: tool.schema.string().min(1).max(1_000),
        force: tool.schema
          .boolean()
          .optional()
          .describe("Force cancellation even when an orphaned/unknown-agent session cannot be reconciled."),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const state = await readTeamState(directory)
        const run = findRun(state, args.runID)
        if (!run) return "No matching CTF team run."
        const activeJobs = run.jobs.filter(
          (job) => !isTerminalJob(job.status) || job.status === "cancel_failed" || (args.force && isOrphanedJob(job)),
        )
        const orphanedJobs = run.jobs.filter(isOrphanedJob)
        if (orphanedJobs.length > 0 && !args.force) {
          throw new Error(
            "The run contains orphaned jobs. Retry with force=true or use ctf-team-repair operation=cancel_orphans.",
          )
        }
        const followUpSessions: FollowUpSession[] = []
        const abortJobs = activeJobs.filter((job) => Boolean(job.sessionID))
        const aborts = await Promise.allSettled(
          abortJobs.map((job) =>
            client.session.abort({
              path: { id: job.sessionID! },
              query: { directory },
            }),
          ),
        )
        const abortByJob = new Map<string, PromiseSettledResult<unknown>>(
          abortJobs.map((job, index) => [job.id, aborts[index]]),
        )
        await updateTeamState(directory, (draft) => {
          const current = findRun(draft, run.id)!
          let abortFailure = 0
          current.notificationPending = false
          for (const job of activeJobs) {
            const cj = current.jobs.find((candidate) => candidate.id === job.id)
            if (
              !cj ||
              (isTerminalJob(cj.status) && cj.status !== "cancel_failed" && !(args.force && isOrphanedJob(cj)))
            ) {
              continue
            }
            const outcome = applyTeamCancellation(
              current,
              cj,
              {
                hasAbortTarget: Boolean(job.sessionID),
                error: job.sessionID ? abortOutcomeError(abortByJob.get(job.id)) : undefined,
              },
              { reason: args.reason, forceOrphan: args.force, abortTargetSessionID: job.sessionID },
            )
            abortFailure += outcome.abortFailed ? 1 : 0
            for (const sessionID of outcome.followUpSessionIDs) {
              if (followUpSessions.some((item) => item.jobID === cj.id && item.sessionID === sessionID)) continue
              followUpSessions.push({
                runID: current.id,
                jobID: cj.id,
                sessionID,
                supersedesSessionID: job.sessionID,
              })
            }
          }
          current.status = abortFailure ? "degraded" : "cancelled"
          if (abortFailure) {
            current.notificationPending = true
            draft.activeRunID = current.id
          } else if (draft.activeRunID === current.id) {
            draft.activeRunID = undefined
          }
        })
        await abortFollowUpSessions(client, directory, followUpSessions, args.reason)
        const updated = findRun(await readTeamState(directory), run.id)!
        return renderRun(updated)
      },
    }),

    "ctf-team-cancel-route": tool({
      description:
        "Cancel all unfinished workers whose routeId is NOT the keepRouteId (e.g. keep R1 when route goes live). Use after Evidence.md marks a route live so other routes stop burning budget.",
      args: {
        runID: tool.schema.string().optional(),
        keepRouteId: tool.schema
          .enum(TEAM_ROUTE_IDS as unknown as [string, ...string[]])
          .describe("Route to keep running (R1|R2|R3|recon|general)"),
        reason: tool.schema.string().min(1).max(1_000).optional(),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const state = await readTeamState(directory)
        const run = findRun(state, args.runID)
        if (!run) return "No matching CTF team run."
        const toCancel = run.jobs.filter(
          (job) =>
            (!isTerminalJob(job.status) || job.status === "cancel_failed") &&
            run.probes.find((probe) => probe.id === job.probeId)?.routeId !== args.keepRouteId,
        )
        if (!toCancel.length) {
          return `No active workers to cancel (keepRouteId=${args.keepRouteId}).\n${renderRun(run)}`
        }
        const followUpSessions: FollowUpSession[] = []
        const abortJobs = toCancel.filter((job) => Boolean(job.sessionID))
        const aborts = await Promise.allSettled(
          abortJobs.map((job) => client.session.abort({ path: { id: job.sessionID! }, query: { directory } })),
        )
        const abortByJob = new Map<string, PromiseSettledResult<unknown>>(
          abortJobs.map((job, index) => [job.id, aborts[index]]),
        )
        await updateTeamState(directory, (draft) => {
          const current = findRun(draft, run.id)!
          for (const job of toCancel) {
            const cj = current.jobs.find((candidate) => candidate.id === job.id)
            if (!cj || (isTerminalJob(cj.status) && cj.status !== "cancel_failed")) continue
            const outcome = applyTeamCancellation(
              current,
              cj,
              {
                hasAbortTarget: Boolean(job.sessionID),
                error: job.sessionID ? abortOutcomeError(abortByJob.get(job.id)) : undefined,
              },
              { reason: args.reason, abortTargetSessionID: job.sessionID },
            )
            for (const sessionID of outcome.followUpSessionIDs) {
              if (followUpSessions.some((item) => item.jobID === cj.id && item.sessionID === sessionID)) continue
              followUpSessions.push({
                runID: current.id,
                jobID: cj.id,
                sessionID,
                supersedesSessionID: job.sessionID,
              })
            }
          }
          refreshTeamRunStatus(current)
        })
        await abortFollowUpSessions(
          client,
          directory,
          followUpSessions,
          args.reason ?? "Route was cancelled by the Expert.",
        )
        const updated = findRun(await readTeamState(directory), run.id)!
        return [
          `Cancelled workers not on route ${args.keepRouteId} (${toCancel.length} jobs).`,
          renderRun(updated),
        ].join("\n")
      },
    }),

    "ctf-team-close": tool({
      description: "Close a terminal CTF Team Mode wave after expert synthesis and record its strategic outcome.",
      args: {
        runID: tool.schema.string().optional(),
        outcome: tool.schema.enum(["solved", "continue", "blocked"]),
        summary: tool.schema.string().min(1).max(6_000),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        await updateTeamState(directory, (state) => {
          const run = findRun(state, args.runID)
          if (!run) throw new Error("No matching CTF team run.")
          if (run.jobs.some((j) => !isTerminalJob(j.status))) {
            throw new Error("Cannot close a run while workers are active.")
          }
          if (run.jobs.some((j) => j.status === "cancel_failed")) {
            throw new Error(
              "Cannot close a run with cancel_failed workers; call ctf-team-cancel or ctf-team-recover until every abort succeeds.",
            )
          }
          run.status = "completed"
          run.outcome = args.outcome
          run.synthesisSummary = args.summary
          run.notificationPending = false
          run.updatedAt = now()
          if (run.outcome !== "solved") {
            // Failure attribution telemetry: runtime-observable labels only.
            run.failureAttribution = classifyRunFailure(run)
          }
          if (state.activeRunID === run.id) state.activeRunID = undefined
        })
        const updated = await readTeamState(directory)
        const closed = findRun(updated, args.runID)
        return closed ? renderRun(closed) : "Run closed."
      },
    }),

    "ctf-team-adopt": tool({
      description:
        "Explicitly rebind a completed-worker Team run to a replacement ctf-expert parent after the original parent disappeared.",
      args: {
        runID: tool.schema.string().min(1),
        reason: tool.schema.string().min(1).max(1_000),
        orphaned: tool.schema
          .boolean()
          .optional()
          .describe("Adopt one orphaned job with a newly-created worker session."),
        jobID: tool.schema.string().optional().describe("Required with orphaned=true."),
        agent: tool.schema
          .enum(TEAM_AGENTS as unknown as [string, ...string[]])
          .optional()
          .describe("Replacement valid agent; required with orphaned=true."),
        force: tool.schema.boolean().optional().describe("Required with orphaned=true; never reuses the old session."),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        if (!context.sessionID) throw new Error("Cannot adopt a Team run without the current parent session ID.")

        if (args.orphaned) {
          if (!args.force || !args.jobID || !args.agent) {
            throw new Error("ctf-team-adopt orphaned=true requires force=true, jobID, and a valid replacement agent.")
          }
          const before = await readTeamState(directory)
          const run = findRun(before, args.runID)
          if (!run) throw new Error(`No matching CTF team run: ${args.runID}`)
          const job = run.jobs.find((candidate) => candidate.id === args.jobID)
          if (!job || !isOrphanedJob(job))
            throw new Error(`Job ${args.jobID} is not an orphaned job in run ${args.runID}.`)
          if (run.parentSessionID !== context.sessionID && hasOpenTeamWorker(run)) {
            throw new Error("Cannot adopt an orphaned job while another worker in the run is active.")
          }
          const previousSessionID = job.sessionID
          if (previousSessionID) {
            const aborted = await client.session.abort({ path: { id: previousSessionID }, query: { directory } })
            if ((aborted as { error?: unknown } | undefined)?.error) {
              throw new Error(
                `Cannot adopt orphaned job until its old session is aborted: ${safeError((aborted as { error: unknown }).error)}`,
              )
            }
          }
          const parentModel = await resolveParentModel(context.sessionID)
          const created = await client.session.create({
            query: { directory },
            body: {
              parentID: context.sessionID,
              title: `[CTF Probe Adopt] ${run.probes.find((probe) => probe.id === job.probeId)?.title ?? job.id}`,
            },
          })
          const createdData = responseData(created, `Create adopted worker ${job.id}`) as { id?: unknown }
          if (typeof createdData.id !== "string" || !createdData.id)
            throw new Error(`Create adopted worker ${job.id} returned an invalid session id.`)
          const replacementSessionID = createdData.id
          let adoptedJob: TeamJob | undefined
          await updateTeamState(directory, (state) => {
            const currentRun = findRun(state, args.runID)
            const currentJob = currentRun?.jobs.find((candidate) => candidate.id === args.jobID)
            if (!currentRun || !currentJob || !isOrphanedJob(currentJob))
              throw new Error("Orphaned job changed during adoption; retry with current state.")
            const adopted = prepareOrphanJobAdoption(currentRun, currentJob, {
              replacementSessionID,
              replacementAgent: args.agent as TeamAgent,
              adoptedBySessionID: context.sessionID!,
              reason: args.reason.trim(),
              ownerToken: randomUUID().slice(0, 8),
              previousSessionID,
            })
            if (!adopted) throw new Error("Orphaned job changed during adoption; retry with current state.")
            state.activeRunID = currentRun.id
            adoptedJob = currentJob
          })
          let probeStartedEvent: TeamEvent | undefined
          try {
            const mcp = await activateAgentDefaults({
              client,
              worktree,
              directory,
              sessionID: replacementSessionID,
              agentName: args.agent as TeamAgent,
            })
            await promptWorkerSession(
              client,
              directory,
              replacementSessionID,
              args.agent,
              parentModel,
              { ...run, parentSessionID: context.sessionID! },
              adoptedJob!,
              options.runtimeVisibility?.exportedToolNames,
              options.runtimeVisibility,
              `Start adopted worker ${job.id}`,
              [
                "Default MCP profile:",
                `- activated: ${mcp.activated.join(", ") || "(none)"}`,
                `- skipped: ${mcp.skipped.join("; ") || "(none)"}`,
                ...(mcp.failed.length
                  ? [
                      `- activation_error: ${mcp.failed.map((item) => `${item.serverName}: ${item.message}`).join("; ")}`,
                    ]
                  : []),
              ],
            )
            await updateTeamState(directory, (state) => {
              const currentRun = findRun(state, args.runID)
              const currentJob = currentRun?.jobs.find((candidate) => candidate.id === args.jobID)
              if (!currentRun || !currentJob || currentJob.sessionID !== replacementSessionID) return
              transitionTeamJob(currentJob, "running")
              currentJob.startedAt = now()
              currentJob.deadlineAt = computeJobDeadlineAt(currentJob.timeoutMs, Date.parse(currentJob.startedAt))
              currentJob.lastHeartbeatAt = currentJob.startedAt
              const probe = currentRun.probes.find((candidate) => candidate.id === currentJob.probeId)
              if (probe) {
                probe.status = "running"
                probe.updatedAt = currentJob.startedAt
              }
              probeStartedEvent = makeTeamEvent("probe_started", currentRun, {
                probeId: currentJob.probeId,
                jobId: currentJob.id,
              })
              refreshTeamRunStatus(currentRun)
            })
            await appendTeamEvents(probeStartedEvent ? [probeStartedEvent] : [])
          } catch (error) {
            await updateTeamState(directory, (state) => {
              const currentRun = findRun(state, args.runID)
              const currentJob = currentRun?.jobs.find((candidate) => candidate.id === args.jobID)
              if (!currentJob || currentJob.sessionID !== replacementSessionID) return
              if (currentRun) {
                failTeamJob(currentRun, currentJob, {
                  phase: "prompt_injection",
                  errorType: classifyTeamError(error, "prompt_injection"),
                  error,
                  retryable: true,
                })
              }
              currentJob.finishedAt = now()
              currentJob.updatedAt = now()
              if (currentRun) refreshTeamRunStatus(currentRun)
            })
            throw error
          }
          return JSON.stringify(
            {
              adopted: true,
              orphaned: true,
              runID: args.runID,
              jobID: args.jobID,
              previousSessionID,
              sessionID: replacementSessionID,
              agent: args.agent,
            },
            null,
            2,
          )
        }

        const before = await readTeamState(directory)
        const run = findRun(before, args.runID)
        if (!run) throw new Error(`No matching CTF team run: ${args.runID}`)
        if (["completed", "cancelled"].includes(run.status)) {
          throw new Error(`Cannot adopt a closed Team run (${run.status}).`)
        }
        if (run.status !== "ready_for_synthesis" && run.status !== "degraded") {
          throw new Error("only ready_for_synthesis or degraded runs are adoptable")
        }
        if (run.parentSessionID === context.sessionID) {
          throw new Error("This Team run is already owned by the current parent session.")
        }
        if (hasOpenTeamWorker(run) || run.jobs.some((job) => job.status === "cancel_failed")) {
          throw new Error(
            "Cannot adopt a Team run while any worker is active or cancellation is uncertain; recover/cancel until every job is terminal and no cancel_failed job remains.",
          )
        }

        const oldParentSessionID = run.parentSessionID
        const presence = await probeSessionPresence(client, directory, oldParentSessionID)
        if (presence !== "absent") {
          throw new Error(
            presence === "present"
              ? "Cannot adopt a Team run while its original parent session still exists."
              : "Cannot prove that the original parent session is gone; the available OpenCode session API is inconclusive.",
          )
        }

        let adopted: TeamRun | undefined
        await updateTeamState(directory, (state) => {
          const current = findRun(state, args.runID)
          if (!current) throw new Error(`No matching CTF team run: ${args.runID}`)
          if (["completed", "cancelled"].includes(current.status)) {
            throw new Error(`Cannot adopt a closed Team run (${current.status}).`)
          }
          if (current.status !== "ready_for_synthesis" && current.status !== "degraded") {
            throw new Error("only ready_for_synthesis or degraded runs are adoptable")
          }
          if (current.parentSessionID !== oldParentSessionID) {
            throw new Error("Team run parent changed during adoption; retry with the current run state.")
          }
          if (hasOpenTeamWorker(current) || current.jobs.some((job) => job.status === "cancel_failed")) {
            throw new Error("Team run gained an active or uncertain worker during adoption; adoption aborted.")
          }
          const active = findRun(state)
          if (active && active.id !== current.id && !["completed", "cancelled"].includes(active.status)) {
            throw new Error(`Another Team run ${active.id} is still ${active.status}; resolve it before adoption.`)
          }
          const audit = rebindTeamParent(current, {
            previousParentSessionID: oldParentSessionID,
            adoptedBySessionID: context.sessionID!,
            reason: args.reason.trim(),
          })
          if (!audit) throw new Error("Team run parent changed during adoption; retry with the current run state.")
          state.activeRunID = current.id
          adopted = current
        })

        return JSON.stringify(
          {
            adopted: true,
            runID: args.runID,
            previousParentSessionID: oldParentSessionID,
            parentSessionID: context.sessionID,
            run: adopted ? { ...adopted, jobs: adopted.jobs.map((job) => ({ ...job })) } : undefined,
          },
          null,
          2,
        )
      },
    }),

    "ctf-team-recover": tool({
      description:
        "Reconcile persisted CTF Team Mode state with OpenCode child sessions after restart, compaction, or interruption.",
      args: { runID: tool.schema.string().optional() },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const normalized = await normalizePersistedTeamState(directory)
        await recoverPendingRetries(args.runID)
        await retryFailedCancellations(args.runID)
        await reconcile(args.runID, true)
        return JSON.stringify(
          {
            ...summarizeTeamState(await readTeamState(directory), context.sessionID),
            repairs: normalized.repairs,
            lockState: await inspectTeamLockState(directory),
          },
          null,
          2,
        )
      },
    }),
  }

  async function collectJobDirect(sessionID: string) {
    await collectJob(sessionID)
  }

  async function notifyParentDirect(runID: string) {
    await notifyParent(runID)
  }

  async function handleTeamEventBridge(event: TeamEventish): Promise<void> {
    const props = event.properties ?? {}

    if (event.type === "session.idle") {
      const sessionID = props.sessionID as string | undefined
      if (!sessionID) return
      const state = await readTeamState(directory)
      const located = findJobBySession(state, sessionID)
      if (located) {
        await collectJobDirect(sessionID)
        await notifyParentDirect(located.run.id)
      } else {
        for (const run of state.runs.filter((r) => r.parentSessionID === sessionID && r.notificationPending)) {
          await notifyParentDirect(run.id)
        }
      }
      return
    }

    if (event.type === "session.status") {
      const sessionID = props.sessionID as string | undefined
      const status = props.status as { type?: string; attempt?: number } | undefined
      if (!sessionID || !status) return
      const existing = findJobBySession(await readTeamState(directory), sessionID)
      if (!existing || isTerminalJob(existing.job.status) || existing.job.retryPending) return
      await updateTeamState(directory, (state) => {
        const current = findJobBySession(state, sessionID)
        if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
        const nextStatus = nextWorkerJobStatus(current.job.status, status.type)
        if (!nextStatus) return
        const previousStatus = current.job.status
        const probe = current.run.probes.find((candidate) => candidate.id === current.job.probeId)
        const eventTime = now()
        if (nextStatus === "failed") {
          persistTeamJobError(current.run, current.job, {
            phase: previousStatus === "starting" ? "session_start" : "running",
            errorType: classifyTeamError(status, "worker_runtime"),
            error: status,
            retryable: true,
          })
        }
        transitionTeamJob(current.job, nextStatus)
        current.job.retryAttempt = status.type === "retry" ? status.attempt : undefined
        if (nextStatus === "running") {
          if (!current.job.startedAt) current.job.startedAt = eventTime
          if (previousStatus !== "running" || !current.job.deadlineAt) {
            current.job.deadlineAt = computeJobDeadlineAt(current.job.timeoutMs, Date.parse(eventTime))
          }
          current.job.lastHeartbeatAt = eventTime
        }
        if (nextStatus === "retrying") {
          current.job.deadlineAt = undefined
          current.job.lastHeartbeatAt = undefined
        }
        if (nextStatus === "failed") {
          current.job.deadlineAt = undefined
          current.job.lastHeartbeatAt = undefined
          current.job.finishedAt = eventTime
        }
        current.job.updatedAt = eventTime
        if (probe && nextStatus === "running") {
          probe.status = "running"
          probe.updatedAt = eventTime
        } else if (probe && nextStatus === "failed") {
          probe.status = "failed"
          probe.updatedAt = eventTime
        }
        refreshTeamRunStatus(current.run)
      })
      return
    }

    if (event.type === "session.error") {
      const sessionID = props.sessionID as string | undefined
      if (!sessionID) return
      const existing = findJobBySession(await readTeamState(directory), sessionID)
      if (!existing || isTerminalJob(existing.job.status) || existing.job.retryPending) return
      await updateTeamState(directory, (state) => {
        const located = findJobBySession(state, sessionID)
        if (!located || isTerminalJob(located.job.status) || located.job.retryPending) return
        failTeamJob(located.run, located.job, {
          phase: "running",
          errorType: classifyTeamError(props.error, "worker_runtime"),
          error: props.error ?? "Unknown worker session error",
          retryable: true,
        })
        clearRetryReservation(located.job)
        finalizeTeamJob(located.run, located.job)
      })
      await notifyParentDirect(existing.run.id)
      return
    }

    if (event.type === "session.deleted") {
      const info = props.info as { id?: string } | undefined
      if (!info?.id) return

      // A deleted parent has no surface on which to receive synthesis or issue
      // a later cancellation. Abort its workers before processing a possible
      // worker-session deletion event with the same lifecycle notification.
      await cancelRunsForDeletedParent(client, directory, info.id)
      const existing = findJobBySession(await readTeamState(directory), info.id)
      if (!existing || isTerminalJob(existing.job.status) || existing.job.retryPending) return
      await updateTeamState(directory, (state) => {
        const located = findJobBySession(state, info.id!)
        if (!located || isTerminalJob(located.job.status) || located.job.retryPending) return
        persistTeamJobError(located.run, located.job, {
          phase: "running",
          errorType: "worker_runtime",
          error: "Worker session was deleted before completion.",
          retryable: true,
        })
        transitionTeamJob(located.job, "interrupted", "Worker session was deleted before completion.")
        clearRetryReservation(located.job)
        finalizeTeamJob(located.run, located.job)
      })
      await notifyParentDirect(existing.run.id)
    }
  }

  async function recoverPendingRetries(runID?: string) {
    const state = await readTeamState(directory)
    const runs = runID ? ([findRun(state, runID)].filter(Boolean) as TeamRun[]) : state.runs
    const pending = runs.flatMap((run) =>
      run.jobs
        .filter((job) => job.retryPending)
        .map((job) => ({ runID: run.id, jobID: job.id, sessionID: job.retrySessionID ?? job.sessionID })),
    )
    for (const item of pending) {
      let abortError: string | undefined
      if (item.sessionID) {
        try {
          const response = await client.session.abort({ path: { id: item.sessionID }, query: { directory } })
          abortError = response?.error ? safeError(response.error) : undefined
        } catch (error) {
          abortError = safeError(error)
        }
      }
      await updateTeamState(directory, (draft) => {
        const run = findRun(draft, item.runID)
        const job = run?.jobs.find((candidate) => candidate.id === item.jobID)
        if (!run || !job) return
        recoverPendingTeamRetry(run, job, abortError)
      })
    }
  }

  async function initialize() {
    try {
      const { state: _state, repairs } = await normalizePersistedTeamState(directory)
      if (repairs.length) {
        console.log(`[team-runtime] repaired persisted state: ${repairs.join(" | ")}`)
      }
      await recoverPendingRetries()
      const recoveredState = await readTeamState(directory)
      const runs = recoveredState.runs.filter((r) => r.jobs.some((j) => j.sessionID && !isTerminalJob(j.status)))
      if (runs.length === 0) return
      console.log(`[team-runtime] recovering ${runs.length} active run(s) on init.`)
      await reconcile(undefined, true)
    } catch (error) {
      console.warn("[team-runtime] startup recovery failed (non-fatal):", safeError(error))
    }
  }

  return {
    tools,
    handleTeamEvent: handleTeamEventBridge,
    initialize,
  }
}

/** Register the Team Mode tool surface for one OpenCode session. */
export function createTeamTools(
  client: OpencodeClient,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
): Record<string, ToolDefinition> {
  return createTeamRuntimeCore(client, directory, worktree, options).tools
}

/** Route one OpenCode event into the Team Mode lifecycle. */
export async function handleTeamEvent(
  event: { type: string; properties?: Record<string, unknown> },
  client: OpencodeClient,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
): Promise<void> {
  await createTeamRuntimeCore(client, directory, worktree, options).handleTeamEvent(event)
}

/** Run startup recovery for persisted Team Mode state. */
export async function initializeTeamRuntime(
  client: OpencodeClient,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
): Promise<void> {
  await createTeamRuntimeCore(client, directory, worktree, options).initialize()
}
