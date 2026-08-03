import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { activateAgentDefaults } from "../dynamic-mcp-manager.ts"
import { listPendingRequests } from "../dynamic-mcp-manager.ts"
import { getSessionSurface } from "../session-surface.ts"
import { canTransitionTeamJob, deriveTeamRunStatus, transitionTeamJob } from "../team-reducer.ts"
import {
  findJobBySession,
  findRun,
  inspectTeamLockState,
  isTerminalJob,
  normalizePersistedTeamState,
  readTeamState,
  updateTeamState,
} from "./team-state.ts"
import { renderRun, summarizeTeamState } from "./team-render.ts"
import { cancelRunsForDeletedParent } from "./parent-session-guard.ts"
import { hasOpenTeamWorker, probeSessionPresence } from "./session-liveness.ts"
import {
  buildRunId,
  DEFAULT_JOB_TIMEOUT_MINUTES,
  DEFAULT_MAX_JOBS,
  MAX_JOB_RESULT,
  resolveMaxJobAttempts,
  TEAM_AGENT,
  TEAM_AGENTS,
  TEAM_ROUTE_IDS,
  now,
  resolveMaxJobs,
  safeError,
  type CreateTeamToolsOptions,
  type TeamAgent,
  type TeamParentAdoption,
  type TeamJob,
  type TeamRun,
  type TeamRouteId,
} from "./team-types.ts"

interface TeamEventish {
  type: string
  properties?: Record<string, any>
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
  job: Pick<TeamJob, "status" | "deadlineAt" | "attempt">,
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

function responseData<T>(response: { data?: T; error?: unknown }, action: string): T {
  if (response.error) throw new Error(`${action} failed: ${safeError(response.error)}`)
  if (response.data === undefined) throw new Error(`${action} returned no data.`)
  return response.data
}

function assertAccepted(response: { error?: unknown }, action: string) {
  if (response.error) throw new Error(`${action} failed: ${safeError(response.error)}`)
}

function buildChildSessionTools(
  exportedNames: string[] | undefined,
  overrides: Record<string, boolean> = {},
): Record<string, boolean> {
  const tools: Record<string, boolean> = {
    // promptAsync.tools is a replacement map on current OpenCode hosts; keep
    // the worker's read-only substrate available alongside plugin tools.
    read: true,
    glob: true,
    grep: true,
    bash: true,
    skill: true,
  }
  if (exportedNames && exportedNames.length > 0) {
    for (const name of exportedNames) {
      if (
        name.startsWith("ctf-") ||
        name.startsWith("archive-") ||
        name.startsWith("seckb_") ||
        name.startsWith("cvekb_") ||
        name.startsWith("anysearch_")
      ) {
        tools[name] = true
      }
    }
  }
  if (Object.keys(tools).length === 0 && Object.keys(overrides).length > 0) {
    return { ...overrides }
  }
  return Object.assign(tools, overrides)
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
  return [
    `You are ${job.agent}, a concurrent worker in CTF Expert Team Mode.`,
    `Run: ${run.title} (${run.id})`,
    `Assignment: ${job.title}`,
    `Evidence route: ${job.routeId} (concurrency=${job.concurrency})`,
    `Objective: ${job.objective}`,
    visibility ? `Expected runtime surface: ${visibility.surface}` : "",
    visibility ? `Expected plugin-visible tools: ${visibility.pluginToolCount ?? 0}` : "",
    visibility ? `external_skills enabled: ${visibility.externalSkillsEnabled ? "yes" : "no"}` : "",
    visibility && visibility.expectedSkills?.length
      ? `Expected skills catalog entries: ${visibility.expectedSkills.join(", ")}`
      : visibility
        ? "Expected skills catalog entries: (none detected by plugin startup diagnostics)"
        : "",
    "Work only on the authorized challenge scope supplied by the parent session.",
    "Do not delegate to another agent. Do not edit Evidence.md, notes.md, .ctf-state.json, .ctf-team.json, or agent_flag.txt.",
    "If you need a heavy MCP, call ctf-dynamic-mcp-advisor action=request and wait — do not install tools ad-hoc.",
    "Avoid modifying shared source files; return proposed scripts or patches as text",
    "unless the assignment explicitly requires an isolated artifact.",
    "Use low-risk local analysis first and obey the challenge risk budget.",
    "If actual visible tools/skills differ materially from the expected runtime surface above, report that mismatch explicitly in FINDINGS before continuing.",
    "Finish with this concise structure:",
    "STATUS: completed | blocked | failed",
    "ROUTE: " + job.routeId,
    "FINDINGS: evidence-backed observations",
    "PRIMITIVES: confirmed capabilities only",
    "ARTIFACTS: paths or reproducible snippets",
    "NEXT: best follow-up action",
  ]
    .filter(Boolean)
    .join("\n")
}

function extractResult(
  messages: Array<{
    info: { role: string; error?: unknown }
    parts: Array<{ type: string; text?: string }>
  }>,
) {
  const assistant = [...messages].reverse().find((m) => m.info.role === "assistant")
  if (!assistant) return { result: "Worker reached idle without an assistant result." }
  if (assistant.info.error) return { error: safeError(assistant.info.error) }
  const text = assistant.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim()
  return { result: (text || "Worker completed without a textual result.").slice(0, MAX_JOB_RESULT) }
}

function refreshRunStatus(_state: any, run: TeamRun) {
  run.updatedAt = now()
  if (run.status === "completed" || run.status === "cancelled" || run.status === "cancelling") return
  run.status = deriveTeamRunStatus(run.jobs, run.status)
  if (run.status === "ready_for_synthesis" || run.status === "degraded") run.notificationPending = true
}

/** Clear an interrupted replacement reservation once a job becomes terminal. */
function clearRetryReservation(job: TeamJob) {
  job.retryPending = false
  job.retrySessionID = undefined
}

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

export function createTeamRuntimeCore(
  client: any,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
) {
  const maxJobs = resolveMaxJobs(options.maxWorkers)
  const maxJobAttempts = resolveMaxJobAttempts(options.maxJobAttempts)

  async function collectJob(sessionID: string) {
    const state = await readTeamState(directory)
    const located = findJobBySession(state, sessionID)
    if (!located || isTerminalJob(located.job.status) || located.job.retryPending) return
    try {
      const response = await client.session.messages({
        path: { id: sessionID },
        query: { directory, limit: 20 },
      })
      const collected = extractResult(responseData(response, `Collect worker ${sessionID}`))
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, sessionID)
        if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
        current.job.updatedAt = now()
        current.job.finishedAt = now()
        if (collected.error) {
          transitionTeamJob(current.job, "failed", collected.error)
        } else {
          transitionTeamJob(current.job, "completed")
          current.job.result = collected.result
        }
        refreshRunStatus(draft, current.run)
      })
    } catch (error) {
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, sessionID)
        if (!current || isTerminalJob(current.job.status) || current.job.retryPending) return
        transitionTeamJob(current.job, "failed", safeError(error))
        current.job.updatedAt = now()
        current.job.finishedAt = now()
        refreshRunStatus(draft, current.run)
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
    let claimed = false
    await updateTeamState(directory, (draft) => {
      const current = findRun(draft, runID)
      if (!current || !current.notificationPending || current.notificationSentAt) return
      current.notificationPending = false
      current.notificationSentAt = now()
      current.notificationError = undefined
      claimed = true
    })
    if (!claimed) return
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
                `CTF Team Mode run ${run.id} is ready for synthesis. Call ctf-team-collect ` +
                `for this run, reconcile Evidence.md (set-route-state per routeId), then either ` +
                `ctf-team-close, ctf-team-cancel-route (if a route went live), or dispatch the next wave.` +
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
    let reserved = false
    await updateTeamState(directory, (draft) => {
      const current = findJobBySession(draft, oldSessionID)
      if (
        !current ||
        current.run.id !== runID ||
        current.job.id !== jobID ||
        current.job.ownerToken !== ownerToken ||
        current.job.status !== "running"
      ) {
        return
      }
      reserved = true
      transitionTeamJob(current.job, "retrying", `Deadline retry attempt ${verdict.attempt} reserved.`)
      current.job.ownerToken = retryOwnerToken
      current.job.retryPending = true
      current.job.attempt = verdict.attempt
      current.job.retryAttempt = verdict.attempt
      current.job.deadlineAt = undefined
      current.job.lastHeartbeatAt = undefined
      current.job.updatedAt = now()
      refreshRunStatus(draft, current.run)
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
        if (
          !current ||
          current.run.id !== runID ||
          current.job.id !== jobID ||
          current.job.ownerToken !== retryOwnerToken ||
          current.job.status !== "retrying"
        ) {
          return
        }
        current.job.attempt = verdict.attempt
        current.job.retryPending = false
        current.job.retrySessionID = undefined
        current.job.abortRequestedAt = now()
        current.job.deadlineAt = undefined
        current.job.lastHeartbeatAt = undefined
        transitionTeamJob(
          current.job,
          "cancel_failed",
          `Worker deadline exceeded (attempt ${verdict.attempt}/${verdict.maxAttempts}); abort failed: ${oldAbortError}`,
        )
        current.job.finishedAt = now()
        current.job.updatedAt = now()
        refreshRunStatus(draft, current.run)
      })
      return
    }

    const afterAbort = await readTeamState(directory)
    const reservedJob = findJobBySession(afterAbort, oldSessionID)
    if (
      !reservedJob ||
      reservedJob.run.id !== runID ||
      reservedJob.job.id !== jobID ||
      reservedJob.job.ownerToken !== retryOwnerToken ||
      reservedJob.job.status !== "retrying" ||
      !reservedJob.job.retryPending
    ) {
      return
    }

    let replacementSessionID: string | undefined
    try {
      const created = await client.session.create({
        query: { directory },
        body: { parentID: run.parentSessionID, title: `[CTF Team Retry ${verdict.attempt}] ${job.title}` },
      })
      const createdData = responseData(created, `Create retry worker ${jobID}`) as { id?: unknown }
      if (typeof createdData.id !== "string" || !createdData.id) {
        throw new Error(`Create retry worker ${jobID} returned an invalid session id.`)
      }
      replacementSessionID = createdData.id
      let replacementRecorded = false
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, oldSessionID)
        if (
          !current ||
          current.run.id !== runID ||
          current.job.id !== jobID ||
          current.job.ownerToken !== retryOwnerToken ||
          current.job.status !== "retrying" ||
          !current.job.retryPending
        ) {
          return
        }
        replacementRecorded = true
        current.job.retrySessionID = replacementSessionID
        current.job.updatedAt = now()
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

      const response = await client.session.promptAsync({
        path: { id: replacementSessionID },
        query: { directory },
        body: {
          agent: job.agent,
          tools: buildChildSessionTools(options.runtimeVisibility?.exportedToolNames, {
            task: false,
            edit: false,
            write: false,
            apply_patch: false,
            "ctf-team-dispatch": false,
            "ctf-team-status": false,
            "ctf-team-collect": false,
            "ctf-team-cancel": false,
            "ctf-team-cancel-route": false,
            "ctf-team-close": false,
            "ctf-team-recover": false,
            "ctf-team-adopt": false,
            "ctf-team-mode": false,
          }),
          parts: [
            {
              type: "text",
              text: [
                workerPrompt(run, job, {
                  surface: options.runtimeVisibility?.surface ?? "ctf-expert",
                  pluginToolCount: options.runtimeVisibility?.pluginToolCount,
                  expectedSkills: options.runtimeVisibility?.expectedSkills,
                  externalSkillsEnabled: options.runtimeVisibility?.externalSkillsEnabled,
                }),
                "",
                `This is bounded retry attempt ${verdict.attempt}/${verdict.maxAttempts} after the previous worker exceeded its deadline.`,
                `Default MCP profile: activated=${mcp.activated.length ? mcp.activated.join(", ") : "(none)"}; skipped=${mcp.skipped.length ? mcp.skipped.join("; ") : "(none)"}${mcp.error ? `; activation_error=${mcp.error}` : ""}`,
                "Continue from persisted Evidence and do not repeat expensive work without a reason.",
              ].join("\n"),
            },
          ],
        },
      })
      assertAccepted(response, `Start retry worker ${jobID}`)
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
        if (
          !current ||
          current.run.id !== runID ||
          current.job.id !== jobID ||
          current.job.ownerToken !== retryOwnerToken ||
          current.job.status !== "retrying"
        ) {
          return
        }
        current.job.attempt = verdict.attempt
        current.job.abortRequestedAt = now()
        current.job.abortSucceededAt = now()
        current.job.deadlineAt = undefined
        current.job.lastHeartbeatAt = undefined
        clearRetryReservation(current.job)
        if (replacementSessionID) current.job.sessionID = replacementSessionID
        transitionTeamJob(
          current.job,
          replacementAbortError ? "cancel_failed" : "failed",
          replacementAbortError
            ? `Deadline retry worker failed to start: ${safeError(error)}; replacement abort failed: ${replacementAbortError}`
            : `Deadline retry worker failed to start: ${safeError(error)}`,
        )
        current.job.finishedAt = now()
        current.job.updatedAt = now()
        refreshRunStatus(draft, current.run)
      })
      return
    }

    let committed = false
    const startedAt = now()
    await updateTeamState(directory, (draft) => {
      const current = findJobBySession(draft, oldSessionID)
      if (
        !current ||
        current.run.id !== runID ||
        current.job.id !== jobID ||
        current.job.ownerToken !== retryOwnerToken ||
        current.job.status !== "retrying"
      ) {
        return
      }
      committed = true
      transitionTeamJob(current.job, "retrying", `Deadline retry attempt ${verdict.attempt} started.`)
      transitionTeamJob(current.job, "running")
      current.job.sessionID = replacementSessionID
      current.job.attempt = verdict.attempt
      current.job.retryAttempt = verdict.attempt
      current.job.retryPending = false
      current.job.retrySessionID = undefined
      current.job.ownerToken = retryOwnerToken
      current.job.startedAt = startedAt
      current.job.deadlineAt = computeJobDeadlineAt(current.job.timeoutMs, Date.parse(startedAt))
      current.job.lastHeartbeatAt = startedAt
      current.job.abortRequestedAt = now()
      current.job.abortSucceededAt = now()
      current.job.finishedAt = undefined
      current.job.error = undefined
      current.job.updatedAt = startedAt
      refreshRunStatus(draft, current.run)
    })

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
        const result = aborts[index]
        const abortError =
          result?.status === "fulfilled"
            ? ((result.value as { error?: unknown } | undefined)?.error
                ? safeError((result.value as { error?: unknown }).error)
                : undefined)
            : safeError(result?.reason)
        if (!abortError) {
          transitionTeamJob(job, "cancelled", "Cancellation retry succeeded during Team recovery.")
        } else {
          transitionTeamJob(job, "cancel_failed", `Cancellation retry failed: ${abortError}`)
        }
        clearRetryReservation(job)
        job.finishedAt = now()
        job.updatedAt = now()
        refreshRunStatus(draft, run)
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

  async function abortFollowUpSessions(
    sessions: Array<{ runID: string; jobID: string; sessionID: string; supersedesSessionID?: string }>,
    reason: string,
  ) {
    const dedupe = (items: typeof sessions) =>
      Array.from(
        new Map(items.map((item) => [`${item.runID}:${item.jobID}:${item.sessionID}`, item])).values(),
      )
    let pending = dedupe(sessions)
    const maxPasses = 4

    for (let pass = 0; pending.length && pass < maxPasses; pass++) {
      const currentPass = pending
      const aborts = await Promise.allSettled(
        currentPass.map((item) =>
          client.session.abort({
            path: { id: item.sessionID },
            query: { directory },
          }),
        ),
      )
      const followUps: typeof sessions = []
      const enqueue = (item: (typeof sessions)[number]) => {
        if (
          !followUps.some(
            (candidate) =>
              candidate.runID === item.runID && candidate.jobID === item.jobID && candidate.sessionID === item.sessionID,
          )
        ) {
          followUps.push(item)
        }
      }

      await updateTeamState(directory, (draft) => {
        for (const [index, item] of currentPass.entries()) {
          const run = findRun(draft, item.runID)
          const job = run?.jobs.find((candidate) => candidate.id === item.jobID)
          if (!run || !job) continue

          // A replacement can be promoted while this follow-up abort is in
          // flight. Keep chasing only sessions newer than the snapshot that
          // produced this item; do not re-abort the already-handled session.
          if (
            job.sessionID &&
            job.sessionID !== item.sessionID &&
            job.sessionID !== item.supersedesSessionID
          ) {
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

          const result = aborts[index]
          const abortError =
            result?.status === "fulfilled"
              ? ((result.value as { error?: unknown } | undefined)?.error
                  ? safeError((result.value as { error?: unknown }).error)
                  : undefined)
              : safeError(result?.reason)
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
      pending = dedupe(followUps)
    }

    if (!pending.length) return
    // A session kept changing while cancellation was being reconciled. Do
    // not report a clean cancellation when ownership could not converge.
    await updateTeamState(directory, (draft) => {
      for (const item of pending) {
        const run = findRun(draft, item.runID)
        const job = run?.jobs.find((candidate) => candidate.id === item.jobID)
        if (!run || !job || (job.status !== "cancelled" && job.status !== "cancel_failed")) continue
        transitionTeamJob(job, "cancel_failed", `${reason}; replacement abort did not converge after ${maxPasses} attempts`)
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

  async function reconcile(runID?: string, shouldNotify = false) {
    const state = await readTeamState(directory)
    const runs = runID ? ([findRun(state, runID)].filter(Boolean) as TeamRun[]) : state.runs
    if (!runs.some((r) => r.jobs.some((j) => j.sessionID && !isTerminalJob(j.status)))) {
      if (shouldNotify) for (const r of runs) await notifyParent(r.id)
      return
    }
    const response = await client.session.status({ query: { directory } })
    const statuses = responseData(response, "Read session status") as Record<string, { type: string; attempt?: number }>
    for (const run of runs) {
      for (const job of run.jobs) {
        if (!job.sessionID || isTerminalJob(job.status) || job.retryPending) continue
        const status = statuses[job.sessionID]

        // Supervisor: enforce the worker deadline for stalled sessions.
        const verdict = evaluateJobDeadline(job, Date.now(), maxJobAttempts)
        if (verdict.action !== "none") {
          if (verdict.action === "interrupt") {
            await retryExpiredWorker(run.id, job.id, job.sessionID, job.ownerToken, verdict, run, job)
          } else {
            let abortError: string | undefined
            try {
              const abortOutcome = await client.session.abort({
                path: { id: job.sessionID },
                query: { directory },
              })
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
              transitionTeamJob(
                current.job,
                abortError ? "cancel_failed" : "failed",
                abortError
                  ? `Worker deadline exceeded (attempt ${verdict.attempt}/${verdict.maxAttempts}); abort failed: ${abortError}`
                  : `Worker deadline exceeded after ${verdict.attempt} attempt(s); retry budget exhausted`,
              )
              current.job.finishedAt = now()
              current.job.updatedAt = now()
              refreshRunStatus(draft, current.run)
            })
          }
          continue
        }
        // Heartbeat: a reconcile poll observing the worker still running is
        // recorded (throttled to 60s) so status can distinguish "alive" from
        // "orphaned".
        if (job.status === "running" && status?.type === "running") {
          const last = job.lastHeartbeatAt ? Date.parse(job.lastHeartbeatAt) : 0
          if (!Number.isFinite(last) || Date.now() - last > 60_000) {
            await updateTeamState(directory, (draft) => {
              const current = findJobBySession(draft, job.sessionID!)
              if (!current || current.job.status !== "running") return
              current.job.lastHeartbeatAt = now()
              current.job.updatedAt = now()
            })
          }
          continue
        }

        if (!status || status.type === "idle") await collectJob(job.sessionID)
        else if (status.type === "retry") {
          await updateTeamState(directory, (draft) => {
            const current = findJobBySession(draft, job.sessionID!)
            if (!current || isTerminalJob(current.job.status)) return
            transitionTeamJob(current.job, "retrying")
            current.job.retryAttempt = status.attempt
            current.job.updatedAt = now()
            refreshRunStatus(draft, current.run)
          })
        }
      }
      if (shouldNotify) await notifyParent(run.id)
    }
  }

  const tools: Record<string, ToolDefinition> = {
    "ctf-team-dispatch": tool({
      description:
        `CTF Expert Team Mode: atomically create and concurrently start 2-${maxJobs} CTF subagent sessions. ` +
        "Each job MUST bind routeId (recon|R1|R2|R3|general). Independent routes run concurrent; " +
        "shared_state jobs should not share a mutable target with another running job. Only ctf-expert (or /ctf expert surface).",
      args: {
        title: tool.schema.string().min(1).max(160).describe("Name of this parallel investigation wave"),
        jobs: tool.schema
          .array(
            tool.schema.object({
              title: tool.schema.string().min(1).max(160),
              objective: tool.schema.string().min(1).max(8_000),
              agent: tool.schema.enum(TEAM_AGENTS as unknown as [string, ...string[]]),
              routeId: tool.schema
                .enum(TEAM_ROUTE_IDS as unknown as [string, ...string[]])
                .describe("Evidence.md route slot: recon | R1 | R2 | R3 | general"),
              concurrency: tool.schema
                .enum(["independent", "shared_state"])
                .optional()
                .describe("independent (default, parallel OK) | shared_state (serial with same target)"),
            }),
          )
          .min(2)
          .max(maxJobs),
        timeoutMinutes: tool.schema
          .number()
          .optional()
          .describe(
            `Hard per-worker deadline in minutes (default ${DEFAULT_JOB_TIMEOUT_MINUTES}). A worker still "running" at the deadline is aborted and replaced within the bounded retry budget (max_job_attempts).`,
          ),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const routeCounts = new Map<string, number>()
        for (const job of args.jobs) {
          const rid = job.routeId
          routeCounts.set(rid, (routeCounts.get(rid) ?? 0) + 1)
        }
        const shared = args.jobs.filter((j) => (j.concurrency ?? "independent") === "shared_state")
        if (shared.length >= 2) {
          const sharedRoutes = new Set(shared.map((j) => j.routeId))
          if (sharedRoutes.size < shared.length) {
            throw new Error(
              "Cannot dispatch two shared_state jobs on the same routeId in one wave — run them serially.",
            )
          }
        }
        for (const r of ["R1", "R2", "R3"] as const) {
          if ((routeCounts.get(r) ?? 0) > 2) {
            throw new Error(`Too many jobs bound to ${r} (max 2). Split into another wave.`)
          }
        }
        const timeoutMs = Math.min(360, Math.max(1, args.timeoutMinutes ?? DEFAULT_JOB_TIMEOUT_MINUTES)) * 60_000
        const run: TeamRun = {
          id: buildRunId(),
          title: args.title,
          parentSessionID: context.sessionID,
          status: "dispatching",
          createdAt: now(),
          updatedAt: now(),
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
            agent: job.agent as TeamAgent,
            routeId: job.routeId as TeamRouteId,
            concurrency: (job.concurrency as "independent" | "shared_state") || "independent",
            status: "queued",
            createdAt: now(),
            updatedAt: now(),
            timeoutMs,
            attempt: 0,
            ownerToken: randomUUID().slice(0, 8),
          })),
        }
        await updateTeamState(directory, (state) => {
          const active = findRun(state)
          if (active && !["completed", "cancelled"].includes(active.status)) {
            throw new Error(
              `Team run ${active.id} is still ${active.status}; collect and close or cancel it before dispatching another wave.`,
            )
          }
          state.runs.push(run)
          state.activeRunID = run.id
        })

        const creations = await Promise.allSettled(
          run.jobs.map((job) =>
            client.session.create({
              query: { directory },
              body: { parentID: context.sessionID, title: `[CTF Team] ${job.title}` },
            }),
          ),
        )
        await updateTeamState(directory, (state) => {
          const current = findRun(state, run.id)
          if (!current) {
            throw new Error(`Team run ${run.id} disappeared while worker sessions were being created.`)
          }
          creations.forEach((result, index) => {
            const job = current.jobs[index]
            job.updatedAt = now()
            if (result.status === "rejected") {
              transitionTeamJob(job, "failed", safeError(result.reason))
              job.finishedAt = now()
              return
            }
            try {
              job.sessionID = (responseData(result.value, `Create worker ${job.id}`) as { id: string }).id
              job.status = "starting"
            } catch (error) {
              transitionTeamJob(job, "failed", safeError(error))
              job.finishedAt = now()
            }
          })
          refreshRunStatus(state, current)
        })

        const created = findRun(await readTeamState(directory), run.id)
        if (!created) throw new Error(`Team run ${run.id} disappeared before worker startup.`)
        const defaultMcpStarts = await Promise.all(
          created.jobs
            .filter((j) => j.sessionID && j.status === "starting")
            .map(async (job) => {
              try {
                const result = await activateAgentDefaults({
                  client,
                  worktree,
                  directory,
                  sessionID: job.sessionID!,
                  agentName: job.agent,
                })
                return { jobId: job.id, activated: result.activated, skipped: result.skipped }
              } catch (error) {
                return { jobId: job.id, activated: [], skipped: [], error: safeError(error) }
              }
            }),
        )
        const defaultMcpByJob = new Map<string, { activated: string[]; skipped: string[]; error?: string }>()
        for (const result of defaultMcpStarts) {
          defaultMcpByJob.set(result.jobId, {
            activated: result.activated,
            skipped: result.skipped,
            error: result.error,
          })
        }
        const starts = await Promise.allSettled(
          created.jobs
            .filter((j) => j.sessionID && j.status === "starting")
            .map(async (job) => {
              const mcp = defaultMcpByJob.get(job.id)
              const response = await client.session.promptAsync({
                path: { id: job.sessionID! },
                query: { directory },
                body: {
                  agent: job.agent,
                  tools: buildChildSessionTools(options.runtimeVisibility?.exportedToolNames, {
                    task: false,
                    edit: false,
                    write: false,
                    apply_patch: false,
                    "ctf-team-dispatch": false,
                    "ctf-team-status": false,
                    "ctf-team-collect": false,
                    "ctf-team-cancel": false,
                    "ctf-team-cancel-route": false,
                    "ctf-team-close": false,
                    "ctf-team-recover": false,
                    "ctf-team-adopt": false,
                    "ctf-team-mode": false,
                  }),
                  parts: [
                    {
                      type: "text",
                      text: [
                        workerPrompt(created, job, {
                          surface: options.runtimeVisibility?.surface ?? "ctf-expert",
                          pluginToolCount: options.runtimeVisibility?.pluginToolCount,
                          expectedSkills: options.runtimeVisibility?.expectedSkills,
                          externalSkillsEnabled: options.runtimeVisibility?.externalSkillsEnabled,
                        }),
                        "",
                        "Default MCP profile:",
                        `- activated: ${mcp?.activated.length ? mcp.activated.join(", ") : "(none)"}`,
                        `- skipped: ${mcp?.skipped.length ? mcp.skipped.join("; ") : "(none)"}`,
                        mcp?.error ? `- activation_error: ${mcp.error}` : "",
                        "Request heavy MCPs only through ctf-dynamic-mcp-advisor with route-bound justification.",
                      ]
                        .filter(Boolean)
                        .join("\n"),
                    },
                  ],
                },
              })
              assertAccepted(response, `Start worker ${job.id}`)
              return job.id
            }),
        )
        const startedIDs = new Set(
          starts.filter((e): e is PromiseFulfilledResult<string> => e.status === "fulfilled").map((e) => e.value),
        )
        const failedStarts = starts.filter((e): e is PromiseRejectedResult => e.status === "rejected")
        await updateTeamState(directory, (state) => {
          const current = findRun(state, run.id)!
          let failIdx = 0
          for (const job of current.jobs) {
            if (startedIDs.has(job.id)) {
              transitionTeamJob(job, "running")
              const startedAt = now()
              job.startedAt = startedAt
              job.deadlineAt = computeJobDeadlineAt(job.timeoutMs, Date.parse(startedAt))
              job.lastHeartbeatAt = startedAt
              job.updatedAt = startedAt
            } else if (job.status === "starting") {
              transitionTeamJob(job, "failed", safeError(failedStarts[failIdx++]?.reason ?? "Worker start failed"))
              job.error = safeError(failedStarts[failIdx - 1]?.reason ?? "Worker start failed")
              job.finishedAt = now()
              job.updatedAt = now()
            }
          }
          refreshRunStatus(state, current)
        })

        const dispatched = findRun(await readTeamState(directory), run.id)!
        return { title: "Concurrent CTF team dispatched", output: renderRun(dispatched), metadata: { runID: run.id } }
      },
    }),

    "ctf-team-status": tool({
      description: "Read persisted CTF Team Mode run and worker lifecycle status.",
      args: { runID: tool.schema.string().optional() },
      async execute(args) {
        const { state, repairs } = await normalizePersistedTeamState(directory)
        const run = findRun(state, args.runID)
        if (!run) return "No matching CTF team run."
        return appendRuntimeNotes(renderRun(run), repairs, await inspectTeamLockState(directory))
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
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        const state = await readTeamState(directory)
        const run = findRun(state, args.runID)
        if (!run) return "No matching CTF team run."
        const activeJobs = run.jobs.filter(
          (j) => j.sessionID && (!isTerminalJob(j.status) || j.status === "cancel_failed"),
        )
        const followUpSessions: Array<{ runID: string; jobID: string; sessionID: string; supersedesSessionID?: string }> = []
        const aborts = await Promise.allSettled(
          activeJobs.map((job) =>
            client.session.abort({
              path: { id: job.sessionID! },
              query: { directory },
            }),
          ),
        )
        await updateTeamState(directory, (draft) => {
          const current = findRun(draft, run.id)!
          let abortFailure = 0
          current.notificationPending = false
          current.updatedAt = now()
          for (const [index, job] of activeJobs.entries()) {
            const cj = current.jobs.find((j) => j.id === job.id)
            if (!cj || (isTerminalJob(cj.status) && cj.status !== "cancel_failed")) continue
            for (const candidate of [cj.sessionID, cj.retrySessionID]) {
              if (
                candidate &&
                candidate !== job.sessionID &&
                !followUpSessions.some((item) => item.jobID === cj.id && item.sessionID === candidate)
              ) {
                followUpSessions.push({ runID: current.id, jobID: cj.id, sessionID: candidate, supersedesSessionID: job.sessionID })
              }
            }
            const result = aborts[index]
            if (result?.status === "fulfilled") {
              const value = result.value as { error?: unknown } | undefined
              if (value?.error) {
                transitionTeamJob(cj, "cancel_failed", `${args.reason}; abort failed: ${safeError(value.error)}`)
                abortFailure++
              } else {
                transitionTeamJob(cj, "cancelled", args.reason)
              }
            } else {
              transitionTeamJob(cj, "cancel_failed", `${args.reason}; abort failed: ${safeError(result?.reason)}`)
              abortFailure++
            }
            clearRetryReservation(cj)
            cj.finishedAt = now()
            cj.updatedAt = now()
          }
          current.status = abortFailure ? "degraded" : "cancelled"
          if (abortFailure) {
            current.notificationPending = true
            draft.activeRunID = current.id
          } else if (draft.activeRunID === current.id) {
            draft.activeRunID = undefined
          }
        })
        await abortFollowUpSessions(followUpSessions, args.reason)
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
        const reason = args.reason || `route ${args.keepRouteId} is live — cancelling other routes`
        const toCancel = run.jobs.filter(
          (j) =>
            j.sessionID && (!isTerminalJob(j.status) || j.status === "cancel_failed") && j.routeId !== args.keepRouteId,
        )
        if (!toCancel.length) {
          return `No active workers to cancel (keepRouteId=${args.keepRouteId}).\n${renderRun(run)}`
        }
        const followUpSessions: Array<{ runID: string; jobID: string; sessionID: string; supersedesSessionID?: string }> = []
        const aborts = await Promise.allSettled(
          toCancel.map((job) =>
            client.session.abort({
              path: { id: job.sessionID! },
              query: { directory },
            }),
          ),
        )
        await updateTeamState(directory, (draft) => {
          const current = findRun(draft, run.id)!
          for (const [index, job] of toCancel.entries()) {
            const cj = current.jobs.find((j) => j.id === job.id)
            if (!cj || (isTerminalJob(cj.status) && cj.status !== "cancel_failed")) continue
            for (const candidate of [cj.sessionID, cj.retrySessionID]) {
              if (
                candidate &&
                candidate !== job.sessionID &&
                !followUpSessions.some((item) => item.jobID === cj.id && item.sessionID === candidate)
              ) {
                followUpSessions.push({ runID: current.id, jobID: cj.id, sessionID: candidate, supersedesSessionID: job.sessionID })
              }
            }
            const result = aborts[index]
            if (result?.status === "fulfilled") {
              const value = result.value as { error?: unknown } | undefined
              if (value?.error) {
                transitionTeamJob(cj, "cancel_failed", `${reason}; abort failed: ${safeError(value.error)}`)
              } else {
                transitionTeamJob(cj, "cancelled", reason)
              }
            } else {
              transitionTeamJob(cj, "cancel_failed", `${reason}; abort failed: ${safeError(result?.reason)}`)
            }
            clearRetryReservation(cj)
            cj.finishedAt = now()
            cj.updatedAt = now()
          }
          refreshRunStatus(draft, current)
        })
        await abortFollowUpSessions(followUpSessions, reason)
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
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        if (!context.sessionID) throw new Error("Cannot adopt a Team run without the current parent session ID.")

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

          const audit: TeamParentAdoption = {
            previousParentSessionID: oldParentSessionID,
            adoptedAt: now(),
            adoptedBySessionID: context.sessionID!,
            reason: args.reason.trim(),
          }
          current.parentSessionID = context.sessionID!
          current.adoptionHistory = [...(current.adoptionHistory ?? []), audit].slice(-8)
          current.notificationError = undefined
          current.notificationSentAt = undefined
          current.notificationPending = ["ready_for_synthesis", "degraded"].includes(current.status)
          current.updatedAt = now()
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
        const eventTime = now()
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
        refreshRunStatus(state, current.run)
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
        transitionTeamJob(located.job, "failed", safeError(props.error ?? "Unknown worker session error"))
        clearRetryReservation(located.job)
        located.job.finishedAt = now()
        located.job.updatedAt = now()
        refreshRunStatus(state, located.run)
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
        transitionTeamJob(located.job, "interrupted", "Worker session was deleted before completion.")
        clearRetryReservation(located.job)
        located.job.finishedAt = now()
        located.job.updatedAt = now()
        refreshRunStatus(state, located.run)
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
        if (!run || !job || !job.retryPending) return
        job.retryPending = false
        job.retrySessionID = undefined
        job.deadlineAt = undefined
        job.lastHeartbeatAt = undefined
        job.finishedAt = now()
        job.updatedAt = now()
        transitionTeamJob(
          job,
          abortError ? "cancel_failed" : "failed",
          abortError
            ? `Retry recovery after runtime restart failed to abort the pending replacement: ${abortError}`
            : "Retry was interrupted by runtime restart; pending worker was aborted.",
        )
        refreshRunStatus(draft, run)
      })
    }
  }

  async function initialize() {
    try {
      const { state, repairs } = await normalizePersistedTeamState(directory)
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
