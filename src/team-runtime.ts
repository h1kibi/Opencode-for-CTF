/**
 * Team Runtime — concurrent CTF-solving orchestration layer.
 *
 * Supports 2–8 parallel category agents dispatched as isolated OpenCode
 * child sessions. Events (session.idle / session.status / session.error /
 * session.deleted) automatically collect results and notify the parent
 * ctf-expert session.
 *
 * State is persisted to `.ctf-team.json` in the project directory.
 * Cross-process safety is provided by atomic rename + in-memory serial
 * queue (not a distributed lock — adequate for single-instance writes).
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { activateAgentDefaults } from "./dynamic-mcp-manager.ts"
import { getSessionSurface } from "./session-surface.ts"

// ---- Minimal event type — accept any shape from the harness hook ----

/** @internal */
interface TeamEventish {
  type: string
  properties?: Record<string, any>
}

// ---------------------------------------------------------------------------
// Types — aligned with ctf-expert's dispatch/synthesis lifecycle
// ---------------------------------------------------------------------------

export const TEAM_AGENTS = [
  "ctf-router",
  "ctf-web",
  "ctf-pwn",
  "ctf-rev",
  "ctf-crypto",
  "ctf-forensics",
  "ctf-misc",
  "ctf-retro",
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

export type TeamRunStatus =
  "dispatching" | "running" | "ready_for_synthesis" | "degraded" | "completed" | "cancelled" | "cancelling"

/** Route slot for Evidence.md binding. recon = pre-route wave; R1-R3 = verify; general = other. */
export type TeamRouteId = "recon" | "R1" | "R2" | "R3" | "general"

export const TEAM_ROUTE_IDS = ["recon", "R1", "R2", "R3", "general"] as const

export type TeamJob = {
  id: string
  title: string
  objective: string
  agent: TeamAgent
  /** Structured bind to Evidence.md route (required on dispatch). */
  routeId: TeamRouteId
  /** Independent routes may run concurrent; shared_state forces serial scheduling hint. */
  concurrency: "independent" | "shared_state"
  sessionID?: string
  status: TeamJobStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  retryAttempt?: number
  result?: string
  error?: string
}

export type TeamRun = {
  id: string
  title: string
  parentSessionID: string
  status: TeamRunStatus
  createdAt: string
  updatedAt: string
  jobs: TeamJob[]
  notificationPending: boolean
  notificationSentAt?: string
  notificationError?: string
  outcome?: "solved" | "continue" | "blocked"
  synthesisSummary?: string
}

export type TeamState = {
  /** Schema version for forward-compatibility. */
  schemaVersion: 1
  revision: number
  updatedAt: string
  activeRunID?: string
  /** Most-recent runs (capped at 20). */
  runs: TeamRun[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_AGENT = "ctf-expert"
const MAX_JOBS = 8
const MAX_JOB_RESULT = 6_000
const MAX_COLLECT_OUTPUT = 32_000
const STATE_FILE = ".ctf-team.json"
const STATE_VERSION = 1

function now() {
  return new Date().toISOString()
}

function safeError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 1_000)
  if (error && typeof error === "object" && "name" in error) return String(error.name).slice(0, 1_000)
  return String(error).slice(0, 1_000)
}

/**
 * Team Mode controllers: ctf-expert, or a session that /ctf routed to expert
 * (command agent may still report as ctf-fast while session-surface is expert).
 */
function requireExpert(agent: string, sessionID?: string) {
  if (agent === TEAM_AGENT) return
  if (sessionID && getSessionSurface(sessionID) === "ctf-expert") return
  throw new Error(
    `${TEAM_AGENT} is the only agent allowed to control Team Mode ` +
      `(got agent=${agent || "unknown"}; if /ctf routed to expert, call ctf-route-plan again or use /ctf-expert).`,
  )
}

function responseData<T>(response: { data?: T; error?: unknown }, action: string): T {
  if (response.error) throw new Error(`${action} failed: ${safeError(response.error)}`)
  if (response.data === undefined) throw new Error(`${action} returned no data.`)
  return response.data
}

function assertAccepted(response: { error?: unknown }, action: string) {
  if (response.error) throw new Error(`${action} failed: ${safeError(response.error)}`)
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "task"
  )
}

// ---------------------------------------------------------------------------
// State persistence — atomic write via temp file + rename
// ---------------------------------------------------------------------------

const stateQueues = new Map<string, Promise<void>>()

function statePath(directory: string) {
  return path.join(directory, STATE_FILE)
}

function emptyState(): TeamState {
  return { schemaVersion: STATE_VERSION, revision: 0, updatedAt: now(), runs: [] }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseState(value: unknown): TeamState {
  if (!isObject(value)) throw new Error("Invalid CTF team state: expected an object.")
  if (value.schemaVersion !== STATE_VERSION) {
    throw new Error(`Unsupported CTF team state version: ${String(value.schemaVersion)}`)
  }
  if (!Array.isArray(value.runs)) throw new Error("Invalid CTF team state: runs must be an array.")
  return value as TeamState
}

export async function readTeamState(directory: string): Promise<TeamState> {
  try {
    return parseState(JSON.parse(await readFile(statePath(directory), "utf8")))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState()
    throw error
  }
}

async function writeTeamState(directory: string, state: TeamState) {
  await mkdir(directory, { recursive: true })
  const target = statePath(directory)
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8")
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Mutate team state with an in-memory serial queue (not a distributed lock,
 *  but sufficient for the single-parent-session use case). */
async function updateTeamState(
  directory: string,
  update: (state: TeamState) => void | Promise<void>,
): Promise<TeamState> {
  const key = statePath(directory)
  const previous = stateQueues.get(key) ?? Promise.resolve()
  let release = () => {}
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  stateQueues.set(
    key,
    previous.then(() => current),
  )
  await previous
  try {
    const state = await readTeamState(directory)
    await update(state)
    state.revision++
    state.updatedAt = now()
    state.runs = state.runs.slice(-20)
    await writeTeamState(directory, state)
    return state
  } finally {
    release()
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function findRun(state: TeamState, runID?: string) {
  const id = runID ?? state.activeRunID
  return id ? state.runs.find((r) => r.id === id) : undefined
}

function findJobBySession(state: TeamState, sessionID: string) {
  for (const run of state.runs) {
    const job = run.jobs.find((j) => j.sessionID === sessionID)
    if (job) return { run, job }
  }
  return undefined
}

function isTerminalJob(status: TeamJobStatus) {
  return ["completed", "failed", "cancelled", "interrupted"].includes(status)
}

function refreshRunStatus(_state: TeamState, run: TeamRun) {
  run.updatedAt = now()
  if (run.status === "completed" || run.status === "cancelled" || run.status === "cancelling") return
  if (run.jobs.some((j) => j.status === "cancel_failed")) {
    run.status = "degraded"
    run.notificationPending = true
    return
  }
  if (run.jobs.some((j) => !isTerminalJob(j.status))) {
    run.status = run.jobs.some((j) => j.status === "queued" || j.status === "starting") ? "dispatching" : "running"
    return
  }
  run.status = run.jobs.some((j) => j.status === "completed") ? "ready_for_synthesis" : "degraded"
  run.notificationPending = true
}

function summarizeTeamState(state: TeamState, sessionID?: string) {
  const relevant = state.runs
    .filter((r) => !sessionID || r.parentSessionID === sessionID || r.jobs.some((j) => j.sessionID === sessionID))
    .slice(-3)
  return {
    revision: state.revision,
    activeRunID: state.activeRunID,
    runs: relevant.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      jobs: r.jobs.map((j) => ({
        id: j.id,
        title: j.title,
        agent: j.agent,
        routeId: j.routeId,
        concurrency: j.concurrency,
        status: j.status,
        error: j.error,
      })),
      outcome: r.outcome,
      synthesisSummary: r.synthesisSummary,
    })),
  }
}

// ---------------------------------------------------------------------------
// Worker prompt template
// ---------------------------------------------------------------------------

function workerPrompt(run: TeamRun, job: TeamJob) {
  return [
    `You are ${job.agent}, a concurrent worker in CTF Expert Team Mode.`,
    `Run: ${run.title} (${run.id})`,
    `Assignment: ${job.title}`,
    `Evidence route: ${job.routeId} (concurrency=${job.concurrency})`,
    `Objective: ${job.objective}`,
    "Work only on the authorized challenge scope supplied by the parent session.",
    "Do not delegate to another agent. Do not edit Evidence.md, notes.md, .ctf-state.json, .ctf-team.json, or agent_flag.txt.",
    "If you need a heavy MCP, call ctf-dynamic-mcp-advisor action=request and wait — do not install tools ad-hoc.",
    "Avoid modifying shared source files; return proposed scripts or patches as text",
    "unless the assignment explicitly requires an isolated artifact.",
    "Use low-risk local analysis first and obey the challenge risk budget.",
    "Finish with this concise structure:",
    "STATUS: completed | blocked | failed",
    "ROUTE: " + job.routeId,
    "FINDINGS: evidence-backed observations",
    "PRIMITIVES: confirmed capabilities only",
    "ARTIFACTS: paths or reproducible snippets",
    "NEXT: best follow-up action",
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Collect worker results
// ---------------------------------------------------------------------------

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

function renderRun(run: TeamRun, includeResults = false) {
  const lines = [
    `run_id: ${run.id}`,
    `title: ${run.title}`,
    `status: ${run.status}`,
    `parent_session: ${run.parentSessionID}`,
    `jobs: ${run.jobs.length}`,
  ]
  for (const job of run.jobs) {
    lines.push(
      `- ${job.id} | ${job.agent} | route=${job.routeId ?? "?"} | ${job.concurrency ?? "independent"} | ${job.status} | ${job.title}`,
    )
    if (job.error) lines.push(`  error: ${job.error}`)
    if (includeResults && job.result) lines.push(`  result:\n${job.result}`)
  }
  return lines.join("\n").slice(0, MAX_COLLECT_OUTPUT)
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function createTeamTools(client: any, directory: string, worktree = directory): ToolMap {
  // ---- Internal helpers that close over client + directory ----

  async function collectJob(sessionID: string) {
    const state = await readTeamState(directory)
    const located = findJobBySession(state, sessionID)
    if (!located || isTerminalJob(located.job.status)) return
    try {
      const response = await client.session.messages({
        path: { id: sessionID },
        query: { directory, limit: 20 },
      })
      const collected = extractResult(responseData(response, `Collect worker ${sessionID}`))
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, sessionID)
        if (!current || isTerminalJob(current.job.status)) return
        current.job.updatedAt = now()
        current.job.finishedAt = now()
        if (collected.error) {
          current.job.status = "failed"
          current.job.error = collected.error
        } else {
          current.job.status = "completed"
          current.job.result = collected.result
        }
        refreshRunStatus(draft, current.run)
      })
    } catch (error) {
      await updateTeamState(directory, (draft) => {
        const current = findJobBySession(draft, sessionID)
        if (!current || isTerminalJob(current.job.status)) return
        current.job.status = "failed"
        current.job.error = safeError(error)
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
    if (!(await parentIsIdle(run.parentSessionID))) return
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
      // Surface pending heavy MCP requests so expert can approve BEFORE next wave
      // (workers may have requested mid-run; idle auto-approve only covers light/medium).
      let mcpHint = ""
      try {
        const { listPendingRequests } = await import("./dynamic-mcp-manager.ts")
        const pending = await listPendingRequests(directory)
        if (pending.length) {
          mcpHint =
            `\n\n⚠️ ${pending.length} MCP request(s) PENDING — call ctf-mcp-control action=list-pending ` +
            `then approve/deny NOW before the next dispatch so workers are not already finished.`
          for (const p of pending.slice(0, 6)) {
            mcpHint += `\n  - ${p.id} agent=${p.agent} mcp=${p.serverName} reason="${p.reason}"`
          }
        }
      } catch {
        /* non-fatal */
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
        if (!job.sessionID || isTerminalJob(job.status)) continue
        const status = statuses[job.sessionID]
        if (!status || status.type === "idle") await collectJob(job.sessionID)
        else if (status.type === "retry") {
          await updateTeamState(directory, (draft) => {
            const current = findJobBySession(draft, job.sessionID!)
            if (!current || isTerminalJob(current.job.status)) return
            current.job.status = "retrying"
            current.job.retryAttempt = status.attempt
            current.job.updatedAt = now()
            refreshRunStatus(draft, current.run)
          })
        }
      }
      if (shouldNotify) await notifyParent(run.id)
    }
  }

  // ---- Tool map ----

  const tools: ToolMap = {
    "ctf-team-dispatch": tool({
      description:
        "CTF Expert Team Mode: atomically create and concurrently start 2-8 CTF subagent sessions. " +
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
          .max(MAX_JOBS),
      },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        // Validate route binding + concurrency policy
        const routeCounts = new Map<string, number>()
        for (const job of args.jobs) {
          const rid = job.routeId
          routeCounts.set(rid, (routeCounts.get(rid) ?? 0) + 1)
        }
        const shared = args.jobs.filter((j) => (j.concurrency ?? "independent") === "shared_state")
        if (shared.length >= 2) {
          // Multiple shared_state jobs in one wave is allowed only if different routeIds
          const sharedRoutes = new Set(shared.map((j) => j.routeId))
          if (sharedRoutes.size < shared.length) {
            throw new Error(
              "Cannot dispatch two shared_state jobs on the same routeId in one wave — run them serially.",
            )
          }
        }
        // Verify wave: prefer at most one job per R1/R2/R3
        for (const r of ["R1", "R2", "R3"] as const) {
          if ((routeCounts.get(r) ?? 0) > 2) {
            throw new Error(`Too many jobs bound to ${r} (max 2). Split into another wave.`)
          }
        }
        const timestamp = now()
        const run: TeamRun = {
          id: `team-${randomUUID()}`,
          title: args.title,
          parentSessionID: context.sessionID,
          status: "dispatching",
          createdAt: timestamp,
          updatedAt: timestamp,
          notificationPending: false,
          jobs: args.jobs.map((job, index) => ({
            id: `job-${index + 1}-${slug(job.title)}`,
            title: job.title,
            objective: job.objective,
            agent: job.agent as TeamAgent,
            routeId: job.routeId as TeamRouteId,
            concurrency: (job.concurrency as "independent" | "shared_state") || "independent",
            status: "queued",
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        }
        await updateTeamState(directory, (state) => {
          const active = findRun(state)
          if (active && !["completed", "cancelled"].includes(active.status)) {
            throw new Error(
              `Team run ${active.id} is still ${active.status}; ` +
                `collect and close or cancel it before dispatching another wave.`,
            )
          }
          state.runs.push(run)
          state.activeRunID = run.id
        })

        // Create child sessions
        const creations = await Promise.allSettled(
          run.jobs.map((job) =>
            client.session.create({
              query: { directory },
              body: { parentID: context.sessionID, title: `[CTF Team] ${job.title}` },
            }),
          ),
        )
        await updateTeamState(directory, (state) => {
          const current = findRun(state, run.id)!
          creations.forEach((result, index) => {
            const job = current.jobs[index]
            job.updatedAt = now()
            if (result.status === "rejected") {
              job.status = "failed"
              job.error = safeError(result.reason)
              job.finishedAt = now()
              return
            }
            try {
              job.sessionID = (responseData(result.value, `Create worker ${job.id}`) as { id: string }).id
              job.status = "starting"
            } catch (error) {
              job.status = "failed"
              job.error = safeError(error)
              job.finishedAt = now()
            }
          })
          refreshRunStatus(state, current)
        })

        // Start child sessions
        const created = findRun(await readTeamState(directory), run.id)!
        const defaultMcpStarts = await Promise.allSettled(
          created.jobs
            .filter((j) => j.sessionID && j.status === "starting")
            .map(async (job) => {
              const result = await activateAgentDefaults({
                client,
                worktree,
                directory,
                sessionID: job.sessionID!,
                agentName: job.agent,
              })
              return {
                jobId: job.id,
                activated: result.activated,
                skipped: result.skipped,
              }
            }),
        )
        const defaultMcpByJob = new Map<
          string,
          { activated: string[]; skipped: string[]; error?: string }
        >()
        for (const result of defaultMcpStarts) {
          if (result.status === "fulfilled") {
            defaultMcpByJob.set(result.value.jobId, {
              activated: result.value.activated,
              skipped: result.value.skipped,
            })
          } else {
            defaultMcpByJob.set("unknown", { activated: [], skipped: [], error: safeError(result.reason) })
          }
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
                  tools: {
                    task: false,
                    edit: false,
                    write: false,
                    apply_patch: false,
                    "ctf-team-dispatch": false,
                    "ctf-team-cancel": false,
                    "ctf-team-close": false,
                  },
                  parts: [
                    {
                      type: "text",
                      text: [
                        workerPrompt(created, job),
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
              job.status = "running"
              job.startedAt = now()
              job.updatedAt = now()
            } else if (job.status === "starting") {
              job.status = "failed"
              job.error = safeError(failedStarts[failIdx++]?.reason ?? "Worker start failed")
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
        const state = await readTeamState(directory)
        const run = findRun(state, args.runID)
        if (!run) return "No matching CTF team run."
        return renderRun(run)
      },
    }),

    "ctf-team-collect": tool({
      description:
        "Reconcile worker sessions and collect bounded evidence/results from a CTF Team Mode run " +
        "for expert synthesis.",
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
        const activeJobs = run.jobs.filter((j) => j.sessionID && !isTerminalJob(j.status))
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
            if (!cj || isTerminalJob(cj.status)) continue
            const result = aborts[index]
            if (result?.status === "rejected") {
              cj.status = "cancel_failed"
              cj.error = `${args.reason}; abort failed: ${safeError(result.reason)}`
              abortFailure++
            } else {
              cj.status = "cancelled"
              cj.error = args.reason
            }
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
        const updated = findRun(await readTeamState(directory), run.id)!
        return renderRun(updated)
      },
    }),

    "ctf-team-cancel-route": tool({
      description:
        "Cancel all unfinished workers whose routeId is NOT the keepRouteId (e.g. keep R1 when route goes live). " +
        "Use after Evidence.md marks a route live so other routes stop burning budget.",
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
          (j) => j.sessionID && !isTerminalJob(j.status) && j.routeId !== args.keepRouteId,
        )
        if (!toCancel.length) {
          return `No active workers to cancel (keepRouteId=${args.keepRouteId}).\n${renderRun(run)}`
        }
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
            if (!cj || isTerminalJob(cj.status)) continue
            const result = aborts[index]
            if (result?.status === "rejected") {
              cj.status = "cancel_failed"
              cj.error = `${reason}; abort failed: ${safeError(result.reason)}`
            } else {
              cj.status = "cancelled"
              cj.error = reason
            }
            cj.finishedAt = now()
            cj.updatedAt = now()
          }
          refreshRunStatus(draft, current)
        })
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

    "ctf-team-recover": tool({
      description:
        "Reconcile persisted CTF Team Mode state with OpenCode child sessions " +
        "after restart, compaction, or interruption.",
      args: { runID: tool.schema.string().optional() },
      async execute(args, context) {
        requireExpert(context.agent, context.sessionID)
        await reconcile(args.runID, true)
        return JSON.stringify(summarizeTeamState(await readTeamState(directory), context.sessionID), null, 2)
      },
    }),
  }

  return tools
}

type ToolMap = Record<string, ToolDefinition>

// ---------------------------------------------------------------------------
// Event handlers — wire these into plugin.ts events
// ---------------------------------------------------------------------------

export function isTeamEvent(event: TeamEventish): boolean {
  return (
    event.type === "session.idle" ||
    event.type === "session.status" ||
    event.type === "session.error" ||
    event.type === "session.deleted"
  )
}

/** Process a Team Mode event and return the directory it affected (or undefined). */
export async function handleTeamEvent(event: TeamEventish, client: any, directory: string): Promise<void> {
  const props = event.properties ?? {}

  if (event.type === "session.idle") {
    const sessionID = props.sessionID as string | undefined
    if (!sessionID) return
    const state = await readTeamState(directory)
    const located = findJobBySession(state, sessionID)
    if (located) {
      await collectJobDirect(client, directory, sessionID)
      await notifyParentDirect(client, directory, located.run.id)
    } else {
      for (const run of state.runs.filter((r) => r.parentSessionID === sessionID && r.notificationPending)) {
        await notifyParentDirect(client, directory, run.id)
      }
    }
    return
  }

  if (event.type === "session.status") {
    const sessionID = props.sessionID as string | undefined
    const status = props.status as { type?: string; attempt?: number } | undefined
    if (!sessionID || !status) return
    const existing = findJobBySession(await readTeamState(directory), sessionID)
    if (!existing || isTerminalJob(existing.job.status) || existing.job.status === "cancel_failed") return
    await updateTeamState(directory, (state) => {
      const located = findJobBySession(state, sessionID)
      if (!located || isTerminalJob(located.job.status) || located.job.status === "cancel_failed") return
      located.job.status = status.type === "retry" ? "retrying" : "running"
      located.job.retryAttempt = status.type === "retry" ? status.attempt : undefined
      located.job.updatedAt = now()
      refreshRunStatus(state, located.run)
    })
    return
  }

  if (event.type === "session.error") {
    const sessionID = props.sessionID as string | undefined
    if (!sessionID) return
    const existing = findJobBySession(await readTeamState(directory), sessionID)
    if (!existing || isTerminalJob(existing.job.status)) return
    await updateTeamState(directory, (state) => {
      const located = findJobBySession(state, sessionID)
      if (!located || isTerminalJob(located.job.status)) return
      located.job.status = "failed"
      located.job.error = safeError(props.error ?? "Unknown worker session error")
      located.job.finishedAt = now()
      located.job.updatedAt = now()
      refreshRunStatus(state, located.run)
    })
    await notifyParentDirect(client, directory, existing.run.id)
    return
  }

  if (event.type === "session.deleted") {
    const info = props.info as { id?: string } | undefined
    if (!info?.id) return
    const existing = findJobBySession(await readTeamState(directory), info.id)
    if (!existing || isTerminalJob(existing.job.status)) return
    await updateTeamState(directory, (state) => {
      const located = findJobBySession(state, info.id!)
      if (!located || isTerminalJob(located.job.status)) return
      located.job.status = "interrupted"
      located.job.error = "Worker session was deleted before completion."
      located.job.finishedAt = now()
      located.job.updatedAt = now()
      refreshRunStatus(state, located.run)
    })
    await notifyParentDirect(client, directory, existing.run.id)
  }
}

/** Initialize — reconcile any dangling jobs on startup. */
export async function initializeTeamRuntime(client: any, directory: string): Promise<void> {
  try {
    const state = await readTeamState(directory)
    const runs = state.runs.filter((r) => r.jobs.some((j) => j.sessionID && !isTerminalJob(j.status)))
    if (runs.length === 0) return
    // Presence of dangling jobs is logged; full recovery is via ctf-team-recover.
    console.log(`[team-runtime] ${runs.length} active run(s) found on init; use ctf-team-recover to reconcile.`)
  } catch {
    // Non-fatal: recovery remains available through ctf-team-recover
  }
}

// Direct helpers (avoiding closure to keep handleTeamEvent callable without createTeamTools)

async function collectJobDirect(client: any, directory: string, sessionID: string) {
  const state = await readTeamState(directory)
  const located = findJobBySession(state, sessionID)
  if (!located || isTerminalJob(located.job.status)) return
  try {
    const response = await client.session.messages({
      path: { id: sessionID },
      query: { directory, limit: 20 },
    })
    const collected = extractResult(responseData(response, `Collect worker ${sessionID}`))
    await updateTeamState(directory, (draft) => {
      const current = findJobBySession(draft, sessionID)
      if (!current || isTerminalJob(current.job.status)) return
      current.job.updatedAt = now()
      current.job.finishedAt = now()
      if (collected.error) {
        current.job.status = "failed"
        current.job.error = collected.error
      } else {
        current.job.status = "completed"
        current.job.result = collected.result
      }
      refreshRunStatus(draft, current.run)
    })
  } catch (error) {
    await updateTeamState(directory, (draft) => {
      const current = findJobBySession(draft, sessionID)
      if (!current || isTerminalJob(current.job.status)) return
      current.job.status = "failed"
      current.job.error = safeError(error)
      current.job.updatedAt = now()
      current.job.finishedAt = now()
      refreshRunStatus(draft, current.run)
    })
  }
}

async function notifyParentDirect(client: any, directory: string, runID: string) {
  const state = await readTeamState(directory)
  const run = findRun(state, runID)
  if (!run || !run.notificationPending || run.notificationSentAt) return
  const parentResponse = await client.session.status({ query: { directory } })
  const statuses = responseData(parentResponse, "Read session status") as Record<string, { type: string }>
  const parentIdle = !statuses[run.parentSessionID] || statuses[run.parentSessionID].type === "idle"
  if (!parentIdle) return
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
    const response = await client.session.promptAsync({
      path: { id: run.parentSessionID },
      query: { directory },
      body: {
        agent: TEAM_AGENT,
        tools: { task: false },
        parts: [{ type: "text" as const, text: `CTF Team Mode run ${runID} is ready for synthesis.` }],
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
