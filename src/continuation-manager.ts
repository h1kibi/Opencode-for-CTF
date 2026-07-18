import type { OpencodeClient, Todo } from "@opencode-ai/sdk"
import { continuationInterruptFile, continuationStateFile } from "./paths.ts"
import { isFutureIso, isoPlusMs, loadJsonFile, nowIso, removeFileIfExists, saveJsonFile } from "./state-store.ts"
import type { ContinuationInterruptMarker, ContinuationState } from "./types.ts"

const AUTO_NUDGE_COOLDOWN_MS = 300_000 // 5 minutes between automatic nudges
const USER_INTERRUPT_SUPPRESS_MS = 10 * 60_000
const PROMPT_FAILURE_BACKOFF_MS = 5 * 60_000
const CONTINUATION_AGENT = "ctf-expert"
const FAST_BUDGET_WARNING_WINDOW_MS = 60_000

export type FastBudgetPolicy = {
  enabled: boolean
  soft_minutes: number
  escalate_on_expiry: boolean
}

export type FastBudgetEvaluation = {
  shouldEscalate: boolean
  shouldPromptReview: boolean
  status: "active" | "review" | "escalated"
  reason?: string
  handoffSummary?: string
}

function defaultState(sessionID: string, directory: string): ContinuationState {
  const now = nowIso()
  const mode = directory.toLowerCase().includes("ctf") ? "ctf" : "daily"
  return {
    version: 1,
    sessionID,
    directory,
    enabled: false,
    mode,
    idleEligible: false,
    createdAt: now,
    updatedAt: now,
  }
}

function defaultInterruptMarker(directory: string): ContinuationInterruptMarker {
  return {
    version: 1,
    directory,
    interruptedAt: nowIso(),
  }
}

export async function loadContinuationState(worktree: string, sessionID: string, directory: string) {
  return loadJsonFile<ContinuationState>(continuationStateFile(worktree, sessionID), defaultState(sessionID, directory))
}

export async function saveContinuationState(worktree: string, state: ContinuationState) {
  state.updatedAt = nowIso()
  await saveJsonFile(continuationStateFile(worktree, state.sessionID), state)
}

export async function markDirectoryContinuationInterruptedByUser(worktree: string, directory: string) {
  await saveJsonFile(continuationInterruptFile(worktree, directory), defaultInterruptMarker(directory))
}

export async function markContinuationInterruptedByUser(worktree: string, sessionID: string, directory: string) {
  const state = await loadContinuationState(worktree, sessionID, directory)
  if (state.mode === "ctf") {
    state.enabled = false
    state.pausedByUser = true
    state.pauseReason = "manual_disable"
    state.suppressUntil = undefined
  } else {
    state.pausedByUser = true
    state.pauseReason = "user_interrupt"
    state.suppressUntil = isoPlusMs(USER_INTERRUPT_SUPPRESS_MS)
  }
  await saveContinuationState(worktree, state)
  await markDirectoryContinuationInterruptedByUser(worktree, directory)
  return state
}

export async function clearContinuationUserPause(
  worktree: string,
  sessionID: string,
  directory: string,
  messageID?: string,
) {
  const state = await loadContinuationState(worktree, sessionID, directory)
  state.pausedByUser = false
  state.pauseReason = undefined
  state.suppressUntil = undefined
  state.lastFailureAt = undefined
  state.lastFailureReason = undefined
  state.idleEligible = false
  if (messageID) {
    state.lastMessageID = messageID
    state.lastNudgeKey = undefined
  }
  await saveContinuationState(worktree, state)
  await removeFileIfExists(continuationInterruptFile(worktree, directory))
  return state
}

function shouldStartFastBudget(
  state: ContinuationState,
  nextAgent: string | undefined,
  policy: FastBudgetPolicy | undefined,
) {
  if (!policy?.enabled) return false
  if (state.mode !== "ctf") return false
  if (nextAgent !== "ctf-fast") return false
  if (state.lastAgent !== "ctf-fast") return true
  if (state.fastBudgetStatus === "review") return false
  if (state.fastBudgetStartedAt === undefined || state.fastBudgetDeadlineAt === undefined) return true
  return false
}

function fastBudgetSuppressionReason(state: ContinuationState) {
  if (state.pausedByUser) return "paused_by_user"
  if (isFutureIso(state.suppressUntil)) return state.lastFailureReason ? "prompt_failure_backoff" : "cooldown"
  return undefined
}

export async function setContinuationSessionMode(
  worktree: string,
  sessionID: string,
  directory: string,
  mode: ContinuationState["mode"],
  agent?: string,
) {
  const state = await loadContinuationState(worktree, sessionID, directory)
  state.mode = mode
  if (agent !== undefined && agent !== "") state.lastAgent = agent
  await saveContinuationState(worktree, state)
  return state
}

export async function noteContinuationSessionStatus(
  worktree: string,
  sessionID: string,
  directory: string,
  status: "idle" | "busy" | "retry",
  opts?: { fastBudget?: FastBudgetPolicy; agent?: string },
) {
  const state = await loadContinuationState(worktree, sessionID, directory)
  state.lastSessionStatus = status
  const nextAgent = opts?.agent !== undefined && opts.agent !== "" ? opts.agent : state.lastAgent
  if (opts?.agent !== undefined && opts.agent !== "") state.lastAgent = opts.agent
  if (shouldStartFastBudget(state, nextAgent, opts?.fastBudget)) {
    state.fastBudgetStartedAt = nowIso()
    const minutes = opts?.fastBudget?.soft_minutes ?? 15
    const ms = Math.max(5, Math.floor(minutes)) * 60_000
    state.fastBudgetDeadlineAt = isoPlusMs(ms)
    state.fastBudgetStatus = "active"
    state.fastBudgetSummary = undefined
    state.fastBudgetReviewSentAt = undefined
  }
  if (status === "busy" || status === "retry") {
    state.idleEligible = true
  }
  await saveContinuationState(worktree, state)
  return state
}

export function summarizeTodos(todos: Todo[]) {
  const pending = todos.filter((todo) => todo.status === "pending")
  const inProgress = todos.filter((todo) => todo.status === "in_progress")
  const high = todos.filter(
    (todo) => todo.priority === "high" && todo.status !== "completed" && todo.status !== "cancelled",
  )
  return {
    total: todos.length,
    pending: pending.length,
    inProgress: inProgress.length,
    highOpen: high.length,
  }
}

export function buildFastBudgetHandoff(state: ContinuationState, summary: ReturnType<typeof summarizeTodos>, reason?: string) {
  const confirmedFacts: string[] = []
  const blockedPaths: string[] = []
  const topHypotheses: string[] = []
  const nextProbe =
    reason === "soft_budget_expired_no_promising_progress" || reason === "soft_budget_expired_review_required"
      ? "Switch to ctf-expert and continue from the saved evidence packet"
      : "Run the best remaining one-variable probe before the 15-minute budget expires"

  if (state.lastTodoSummary) confirmedFacts.push(`todo_summary: ${state.lastTodoSummary}`)
  confirmedFacts.push(`last_session_status: ${state.lastSessionStatus ?? "unknown"}`)
  confirmedFacts.push(`in_progress: ${summary.inProgress}`)
  confirmedFacts.push(`high_open: ${summary.highOpen}`)
  if (reason) confirmedFacts.push(`budget_reason: ${reason}`)
  if (state.fastBudgetStartedAt) confirmedFacts.push(`fast_budget_started_at: ${state.fastBudgetStartedAt}`)
  if (state.fastBudgetDeadlineAt) confirmedFacts.push(`fast_budget_deadline_at: ${state.fastBudgetDeadlineAt}`)
  if (state.fastBudgetSummary) confirmedFacts.push(`budget_summary: ${state.fastBudgetSummary}`)
  if (summary.inProgress === 0 && summary.highOpen === 0) blockedPaths.push("fast-lane stalled / no active high-signal branch")
  topHypotheses.push(state.lastAgent === "ctf-fast" ? "fast lane exhausted; expert lane should continue" : "unknown")

  return [
    "## CTF Fast Handoff Block",
    "Target:",
    `- ${state.directory}`,
    "Flag format:",
    "- unknown",
    "Category:",
    "- unknown",
    "Confirmed facts:",
    ...confirmedFacts.map((line) => `- ${line}`),
    "Blocked paths:",
    ...(blockedPaths.length ? blockedPaths.map((line) => `- ${line}`) : ["- none recorded"]),
    "Top hypotheses:",
    ...topHypotheses.map((line) => `- ${line}`),
    "Current primitive:",
    "- none / unknown",
    "Last probe:",
    "- see session.todo and the latest evidence packet",
    "Next probe:",
    `- ${nextProbe}`,
    "Escalation:",
    "- ESCALATE: ctf-expert",
    "Candidate flag:",
    "- unknown",
    "Files:",
    `- ${state.directory}/resume.md`,
    `- ${state.directory}/handoff.md`,
    `- ${state.directory}/Evidence.md`,
  ].join("\n")
}

export function evaluateFastBudget(
  state: ContinuationState,
  summary: ReturnType<typeof summarizeTodos>,
  policy?: FastBudgetPolicy,
): FastBudgetEvaluation {
  if (!policy?.enabled) return { shouldEscalate: false, shouldPromptReview: false, status: "active" }
  if (state.mode !== "ctf") return { shouldEscalate: false, shouldPromptReview: false, status: "active" }
  if (state.lastAgent !== "ctf-fast") return { shouldEscalate: false, shouldPromptReview: false, status: "active" }
  if (state.pausedByUser) return { shouldEscalate: false, shouldPromptReview: false, status: "blocked", reason: "paused_by_user" }
  if (isFutureIso(state.suppressUntil)) {
    return {
      shouldEscalate: false,
      shouldPromptReview: false,
      status: "blocked",
      reason: state.lastFailureReason ? "prompt_failure_backoff" : "cooldown",
    }
  }
  if (!state.fastBudgetDeadlineAt) return { shouldEscalate: false, shouldPromptReview: false, status: "active" }
  const deadline = Date.parse(state.fastBudgetDeadlineAt)
  if (Number.isNaN(deadline)) return { shouldEscalate: false, shouldPromptReview: false, status: "active" }
  const remaining = deadline - Date.now()
  const stalled = summary.inProgress === 0 && summary.highOpen === 0
  if (remaining <= 0) {
    const shouldEscalate = policy.escalate_on_expiry === true
    const handoffSummary = buildFastBudgetHandoff(
      state,
      summary,
      stalled ? "soft_budget_expired_no_promising_progress" : "soft_budget_expired_review_required",
    )
    return {
      shouldEscalate,
      shouldPromptReview: !shouldEscalate,
      status: shouldEscalate ? "escalated" : "review",
      reason: stalled ? "soft_budget_expired_no_promising_progress" : "soft_budget_expired_review_required",
      handoffSummary,
    }
  }
  if (remaining <= FAST_BUDGET_WARNING_WINDOW_MS) {
    if (state.fastBudgetStatus === "review") {
      return { shouldEscalate: false, shouldPromptReview: false, status: "review" }
    }
    const reason = stalled ? "soft_budget_near_expiry_stalled" : "soft_budget_near_expiry_review"
    return {
      shouldEscalate: false,
      shouldPromptReview: true,
      status: "review",
      reason,
      handoffSummary: buildFastBudgetHandoff(state, summary, reason),
    }
  }
  return { shouldEscalate: false, shouldPromptReview: false, status: "active" }
}

export async function applyFastBudgetAction(args: {
  client: OpencodeClient
  worktree: string
  sessionID: string
  directory: string
  policy?: FastBudgetPolicy
  summary?: ReturnType<typeof summarizeTodos>
}) {
  const state = await loadContinuationState(args.worktree, args.sessionID, args.directory)
  const suppression = fastBudgetSuppressionReason(state)
  if (suppression) {
    await saveContinuationState(args.worktree, state)
    return {
      prompted: false,
      summary: args.summary ?? summarizeTodos([]),
      budget: { shouldEscalate: false, shouldPromptReview: false, status: "blocked", reason: suppression },
    }
  }
  const summary = args.summary ?? summarizeTodos((await args.client.session.todo({ path: { id: args.sessionID }, query: { directory: args.directory } })).data ?? [])
  state.lastTodoSummary = `pending=${summary.pending},in_progress=${summary.inProgress},high_open=${summary.highOpen}`
  const budget = evaluateFastBudget(state, summary, args.policy)
  if (!budget.shouldEscalate && !budget.shouldPromptReview) {
    await saveContinuationState(args.worktree, state)
    return { prompted: false, summary, budget }
  }

  const prompt = budget.shouldEscalate
    ? [
        "ESCALATE: ctf-expert",
        "",
        "ctf-fast soft budget expired. Switch to ctf-expert now, resume from the saved handoff below, and do not restart broad recon.",
        "",
        budget.handoffSummary ?? buildFastBudgetHandoff(state, summary, budget.reason),
      ].join("\n")
    : [
        "CTF fast-budget review required.",
        "",
        "Judge whether the current fast lane is clearly closing on a flag. If not, save state and escalate to ctf-expert.",
        "",
        budget.handoffSummary ?? buildFastBudgetHandoff(state, summary, budget.reason),
      ].join("\n")

  try {
    await args.client.session.promptAsync({
      path: { id: args.sessionID },
      query: { directory: args.directory },
      body: {
        agent: budget.shouldEscalate ? "ctf-expert" : state.lastAgent,
        parts: [
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    })
  } catch (err) {
    state.lastFailureAt = nowIso()
    state.lastFailureReason = String((err as { message?: string }).message ?? "prompt_async_failed")
    state.suppressUntil = isoPlusMs(PROMPT_FAILURE_BACKOFF_MS)
    await saveContinuationState(args.worktree, state)
    return {
      prompted: false,
      summary,
      budget,
      suppressionReason: "prompt_failure_backoff",
      error: state.lastFailureReason,
    }
  }

  state.fastBudgetStatus = budget.status
  state.fastBudgetSummary = budget.handoffSummary ?? budget.reason
  if (budget.shouldEscalate) state.fastBudgetDeadlineAt = undefined
  if (budget.status === "review") state.fastBudgetReviewSentAt = nowIso()
  state.lastFailureAt = undefined
  state.lastFailureReason = undefined
  await saveContinuationState(args.worktree, state)
  return { prompted: true, summary, budget, prompt }
}

/** @visibleForTesting */
export function buildNudgeKey(summary: ReturnType<typeof summarizeTodos>, state: ContinuationState) {
  return [state.lastMessageID ?? "nomsg", summary.pending, summary.inProgress, summary.highOpen].join("|")
}

/** @visibleForTesting */
export function needsContinuationPrompt(summary: ReturnType<typeof summarizeTodos>, state: ContinuationState) {
  if (!state.enabled) return false
  if (state.mode !== "ctf") return false
  if (state.lastAgent !== CONTINUATION_AGENT) return false
  if (!state.idleEligible) return false
  if (state.pausedByUser) return false
  if (isFutureIso(state.suppressUntil)) return false
  if (summary.inProgress > 0) return true
  if (summary.highOpen > 0) return true
  return false
}

/** @visibleForTesting */
export function buildSuppressionReason(state: ContinuationState) {
  if (!state.enabled) return "disabled"
  if (state.mode !== "ctf") return "mode_not_allowed"
  if (state.lastAgent !== CONTINUATION_AGENT) return "agent_not_allowed"
  if (state.pausedByUser) return "paused_by_user"
  if (isFutureIso(state.suppressUntil)) return state.lastFailureReason ? "failure_backoff" : "cooldown"
  return undefined
}

async function hasRecentDirectoryInterrupt(worktree: string, directory: string) {
  const marker = await loadJsonFile<ContinuationInterruptMarker | null>(
    continuationInterruptFile(worktree, directory),
    null,
  )
  if (!marker) return false
  return isFutureIso(isoPlusMsFrom(marker.interruptedAt, USER_INTERRUPT_SUPPRESS_MS))
}

/** @visibleForTesting */
export function isoPlusMsFrom(startIso: string, ms: number) {
  const start = Date.parse(startIso)
  if (Number.isNaN(start)) return undefined
  return new Date(start + ms).toISOString()
}

export async function continuationCheck(args: {
  client: OpencodeClient
  worktree: string
  sessionID: string
  directory: string
  agent?: string
  lastMessageID?: string
  force?: boolean
}) {
  const state = await loadContinuationState(args.worktree, args.sessionID, args.directory)
  const todoResult = await args.client.session.todo({
    path: { id: args.sessionID },
    query: { directory: args.directory },
  })
  const todos = todoResult.data ?? []
  const summary = summarizeTodos(todos)

  state.lastAgent = args.agent ?? state.lastAgent
  state.lastMessageID = args.lastMessageID ?? state.lastMessageID
  state.lastTodoSummary = `pending=${summary.pending},in_progress=${summary.inProgress},high_open=${summary.highOpen}`

  const suppressionReason = args.force ? undefined : buildSuppressionReason(state)
  if (suppressionReason) {
    await saveContinuationState(args.worktree, state)
    return { shouldNudge: false, summary, suppressionReason }
  }

  if (!args.force && (await hasRecentDirectoryInterrupt(args.worktree, args.directory))) {
    await saveContinuationState(args.worktree, state)
    return { shouldNudge: false, summary, suppressionReason: "recent_user_interrupt" }
  }

  const shouldNudge = args.force ? true : needsContinuationPrompt(summary, state)
  if (!shouldNudge) {
    await saveContinuationState(args.worktree, state)
    return { shouldNudge: false, summary }
  }

  const nudgeKey = buildNudgeKey(summary, state)
  if (!args.force && state.lastNudgeKey === nudgeKey) {
    await saveContinuationState(args.worktree, state)
    return { shouldNudge: false, summary, suppressionReason: "unchanged_todo_state" }
  }

  const prompt =
    state.mode === "ctf"
      ? "Continue the active CTF branch. Use the current strongest evidence, do not restart broad recon, and execute the single best next low-risk probe or closure action. If state is stale, refresh the structured evidence packet first."
      : "Continue the unfinished work. Pick up the current in-progress todo, do the next concrete step, and do not stop at explanation if implementation or verification remains."

  try {
    await args.client.session.promptAsync({
      path: { id: args.sessionID },
      query: { directory: args.directory },
      body: {
        agent: args.agent,
        parts: [
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    })
  } catch (err) {
    state.lastFailureAt = nowIso()
    state.lastFailureReason = String((err as { message?: string }).message ?? "prompt_async_failed")
    state.suppressUntil = isoPlusMs(PROMPT_FAILURE_BACKOFF_MS)
    await saveContinuationState(args.worktree, state)
    return {
      shouldNudge: false,
      summary,
      suppressionReason: "prompt_failure_backoff",
      error: state.lastFailureReason,
    }
  }

  state.lastNudgeAt = nowIso()
  state.lastNudgeKey = nudgeKey
  state.lastFailureAt = undefined
  state.lastFailureReason = undefined
  state.lastSessionStatus = "idle"
  state.idleEligible = false
  state.suppressUntil = isoPlusMs(AUTO_NUDGE_COOLDOWN_MS)
  if (!state.pausedByUser) state.pauseReason = "cooldown"
  await saveContinuationState(args.worktree, state)
  return { shouldNudge: true, summary, prompt }
}
