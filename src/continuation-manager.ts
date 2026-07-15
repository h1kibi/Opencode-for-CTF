import type { OpencodeClient, Todo } from "@opencode-ai/sdk"
import { continuationInterruptFile, continuationStateFile } from "./paths.ts"
import { isFutureIso, isoPlusMs, loadJsonFile, nowIso, removeFileIfExists, saveJsonFile } from "./state-store.ts"
import type { ContinuationInterruptMarker, ContinuationState } from "./types.ts"

const AUTO_NUDGE_COOLDOWN_MS = 90_000
const USER_INTERRUPT_SUPPRESS_MS = 10 * 60_000
const PROMPT_FAILURE_BACKOFF_MS = 5 * 60_000
const CONTINUATION_AGENT = "ctf-master"

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

export async function clearContinuationUserPause(worktree: string, sessionID: string, directory: string, messageID?: string) {
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

export async function noteContinuationSessionStatus(worktree: string, sessionID: string, directory: string, status: "idle" | "busy" | "retry") {
  const state = await loadContinuationState(worktree, sessionID, directory)
  state.lastSessionStatus = status
  if (status === "busy" || status === "retry") {
    state.idleEligible = true
  }
  await saveContinuationState(worktree, state)
  return state
}

function summarizeTodos(todos: Todo[]) {
  const pending = todos.filter((todo) => todo.status === "pending")
  const inProgress = todos.filter((todo) => todo.status === "in_progress")
  const high = todos.filter((todo) => todo.priority === "high" && todo.status !== "completed" && todo.status !== "cancelled")
  return {
    total: todos.length,
    pending: pending.length,
    inProgress: inProgress.length,
    highOpen: high.length,
  }
}

function buildNudgeKey(summary: ReturnType<typeof summarizeTodos>, state: ContinuationState) {
  return [state.lastMessageID || "nomsg", summary.pending, summary.inProgress, summary.highOpen].join("|")
}

function needsContinuationPrompt(summary: ReturnType<typeof summarizeTodos>, state: ContinuationState) {
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

function buildSuppressionReason(state: ContinuationState) {
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

function isoPlusMsFrom(startIso: string, ms: number) {
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

  if (!args.force && await hasRecentDirectoryInterrupt(args.worktree, args.directory)) {
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

  const prompt = state.mode === "ctf"
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
    state.lastFailureReason = String((err as { message?: string }).message || "prompt_async_failed")
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
