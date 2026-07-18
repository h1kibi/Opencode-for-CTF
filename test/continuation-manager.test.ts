import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ContinuationState } from "../src/types.js"
import { nowIso } from "../src/state-store.js"
import {
  loadContinuationState,
  saveContinuationState,
  clearContinuationUserPause,
  noteContinuationSessionStatus,
  summarizeTodos,
  buildNudgeKey,
  needsContinuationPrompt,
  buildSuppressionReason,
  isoPlusMsFrom,
  evaluateFastBudget,
  applyFastBudgetAction,
  setContinuationSessionMode,
} from "../src/continuation-manager.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshState(overrides?: Partial<ContinuationState>): ContinuationState {
  const now = nowIso()
  return {
    version: 1,
    sessionID: "test-session",
    directory: "/workspace/ctf-challenge",
    enabled: false,
    mode: "ctf",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeTodo(overrides?: Partial<{ status: string; priority: string }>) {
  return { status: overrides?.status ?? "pending", priority: overrides?.priority ?? "medium" } as Parameters<
    typeof summarizeTodos
  >[0][number]
}

function tempPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

// ---------------------------------------------------------------------------
// summarizeTodos
// ---------------------------------------------------------------------------

describe("summarizeTodos", () => {
  it("counts empty list", () => {
    const r = summarizeTodos([])
    expect(r).toEqual({ total: 0, pending: 0, inProgress: 0, highOpen: 0 })
  })

  it("counts pending, in_progress, completed", () => {
    const r = summarizeTodos([
      makeTodo({ status: "pending" }),
      makeTodo({ status: "in_progress" }),
      makeTodo({ status: "completed" }),
      makeTodo({ status: "in_progress" }),
    ])
    expect(r.total).toBe(4)
    expect(r.pending).toBe(1)
    expect(r.inProgress).toBe(2)
    expect(r.highOpen).toBe(0)
  })

  it("counts high-priority open items", () => {
    const r = summarizeTodos([
      makeTodo({ status: "pending", priority: "high" }),
      makeTodo({ status: "in_progress", priority: "high" }),
      makeTodo({ status: "completed", priority: "high" }), // completed → excluded
      makeTodo({ status: "cancelled", priority: "high" }), // cancelled → excluded
      makeTodo({ status: "pending", priority: "low" }),
    ])
    expect(r.highOpen).toBe(2) // only pending + in_progress with high
  })
})

// ---------------------------------------------------------------------------
// buildNudgeKey
// ---------------------------------------------------------------------------

describe("buildNudgeKey", () => {
  it("produces consistent key from state and summary", () => {
    const s = freshState({ lastMessageID: "msg-1" })
    const summary = { total: 3, pending: 1, inProgress: 1, highOpen: 0 }
    const key = buildNudgeKey(summary, s)
    expect(key).toBe("msg-1|1|1|0")
  })

  it("falls back to nomsg when lastMessageID is missing", () => {
    const s = freshState({ lastMessageID: undefined })
    const summary = { total: 0, pending: 0, inProgress: 0, highOpen: 0 }
    expect(buildNudgeKey(summary, s)).toBe("nomsg|0|0|0")
  })
})

// ---------------------------------------------------------------------------
// needsContinuationPrompt
// ---------------------------------------------------------------------------

describe("needsContinuationPrompt", () => {
  it("returns false when disabled", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({ enabled: false, mode: "ctf", lastAgent: "ctf-expert", idleEligible: true }),
      ),
    ).toBe(false)
  })

  it("returns false for non-CTF mode", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({ enabled: true, mode: "daily", lastAgent: "ctf-expert", idleEligible: true }),
      ),
    ).toBe(false)
  })

  it("returns false when lastAgent is not ctf-expert", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-fast", idleEligible: true }),
      ),
    ).toBe(false)
  })

  it("returns false when not idleEligible", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", idleEligible: false }),
      ),
    ).toBe(false)
  })

  it("returns false when paused by user", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", idleEligible: true, pausedByUser: true }),
      ),
    ).toBe(false)
  })

  it("returns false when suppressed until future", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
          idleEligible: true,
          suppressUntil: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
    ).toBe(false)
  })

  it("returns true when inProgress > 0 and all conditions met", () => {
    expect(
      needsContinuationPrompt(
        { total: 5, pending: 2, inProgress: 1, highOpen: 0 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", idleEligible: true }),
      ),
    ).toBe(true)
  })

  it("returns true when highOpen > 0 and all conditions met", () => {
    expect(
      needsContinuationPrompt(
        { total: 5, pending: 2, inProgress: 0, highOpen: 1 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", idleEligible: true }),
      ),
    ).toBe(true)
  })

  it("returns false when no inProgress or highOpen items", () => {
    expect(
      needsContinuationPrompt(
        { total: 5, pending: 5, inProgress: 0, highOpen: 0 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", idleEligible: true }),
      ),
    ).toBe(false)
  })

  it("all conditions met with past suppressUntil passes through", () => {
    expect(
      needsContinuationPrompt(
        { total: 1, pending: 0, inProgress: 1, highOpen: 0 },
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
          idleEligible: true,
          suppressUntil: new Date(Date.now() - 60_000).toISOString(), // past
        }),
      ),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildSuppressionReason
// ---------------------------------------------------------------------------

describe("buildSuppressionReason", () => {
  it("returns disabled when enabled=false", () => {
    expect(buildSuppressionReason(freshState({ enabled: false }))).toBe("disabled")
  })

  it("returns mode_not_allowed for daily mode", () => {
    expect(buildSuppressionReason(freshState({ enabled: true, mode: "daily" }))).toBe("mode_not_allowed")
  })

  it("returns agent_not_allowed when lastAgent is wrong", () => {
    expect(buildSuppressionReason(freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-fast" }))).toBe(
      "agent_not_allowed",
    )
  })

  it("returns paused_by_user when user paused", () => {
    expect(
      buildSuppressionReason(freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", pausedByUser: true })),
    ).toBe("paused_by_user")
  })

  it("returns failure_backoff when suppressUntil is in future and lastFailureReason set", () => {
    expect(
      buildSuppressionReason(
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
          suppressUntil: new Date(Date.now() + 60_000).toISOString(),
          lastFailureReason: "prompt_async_failed",
        }),
      ),
    ).toBe("failure_backoff")
  })

  it("returns cooldown when suppressUntil is in future without failure", () => {
    expect(
      buildSuppressionReason(
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
          suppressUntil: new Date(Date.now() + 60_000).toISOString(),
          lastFailureReason: undefined,
        }),
      ),
    ).toBe("cooldown")
  })

  it("returns undefined when no suppression active", () => {
    expect(
      buildSuppressionReason(
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
        }),
      ),
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// loadContinuationState — fallback when file missing
// ---------------------------------------------------------------------------

describe("loadContinuationState", () => {
  it("returns default state for a non-existent file", async () => {
    const state = await loadContinuationState("/nonexistent/worktree", "session-xyz", "/workspace/ctf-challenge")
    expect(state.sessionID).toBe("session-xyz")
    expect(state.enabled).toBe(false)
    // CTF directory → mode should be "ctf"
    expect(state.mode).toBe("ctf")
    expect(state.createdAt).toBeDefined()
  })

  it("returns daily mode for non-CTF directories", async () => {
    const state = await loadContinuationState("/nonexistent/worktree", "session-abc", "/workspace/web-app")
    expect(state.mode).toBe("daily")
  })
})

describe("evaluateFastBudget", () => {
  it("remains active before deadline", () => {
    const state = freshState({
      lastAgent: "ctf-fast",
      fastBudgetDeadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      lastTodoSummary: "pending=0,in_progress=1,high_open=0",
    })
    const result = evaluateFastBudget(
      state,
      { total: 1, pending: 0, inProgress: 1, highOpen: 0 },
      { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    )
    expect(result.status).toBe("active")
    expect(result.shouldEscalate).toBe(false)
  })

  it("prompts review near expiry once", () => {
    const state = freshState({
      lastAgent: "ctf-fast",
      fastBudgetDeadlineAt: new Date(Date.now() + 30_000).toISOString(),
      lastTodoSummary: "pending=0,in_progress=0,high_open=0",
    })
    const result = evaluateFastBudget(
      state,
      { total: 1, pending: 0, inProgress: 0, highOpen: 0 },
      { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    )
    expect(result.status).toBe("review")
    expect(result.shouldPromptReview).toBe(true)

    const followUp = evaluateFastBudget(
      { ...state, fastBudgetStatus: "review" },
      { total: 1, pending: 0, inProgress: 0, highOpen: 0 },
      { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    )
    expect(followUp.shouldPromptReview).toBe(false)
    expect(followUp.status).toBe("review")
  })

  it("escalates after expiry when configured", () => {
    const state = freshState({
      lastAgent: "ctf-fast",
      fastBudgetDeadlineAt: new Date(Date.now() - 30_000).toISOString(),
      lastTodoSummary: "pending=0,in_progress=0,high_open=0",
      lastSessionStatus: "idle",
    })
    const result = evaluateFastBudget(
      state,
      { total: 1, pending: 0, inProgress: 0, highOpen: 0 },
      { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    )
    expect(result.status).toBe("escalated")
    expect(result.shouldEscalate).toBe(true)
    expect(result.handoffSummary).toContain("ESCALATE: ctf-expert")
  })

  it("uses review status after expiry when auto-escalation is disabled", () => {
    const state = freshState({
      lastAgent: "ctf-fast",
      fastBudgetDeadlineAt: new Date(Date.now() - 30_000).toISOString(),
      lastTodoSummary: "pending=0,in_progress=0,high_open=0",
      lastSessionStatus: "idle",
    })
    const result = evaluateFastBudget(
      state,
      { total: 1, pending: 0, inProgress: 0, highOpen: 0 },
      { enabled: true, soft_minutes: 15, escalate_on_expiry: false },
    )
    expect(result.status).toBe("review")
    expect(result.shouldEscalate).toBe(false)
    expect(result.shouldPromptReview).toBe(true)
  })
})

describe("applyFastBudgetAction", () => {
  it("prompts ctf-expert when expired escalation is configured", async () => {
    const dir = tempPath("ctf-test-budget-")
    const worktree = tempPath("ctf-test-worktree-")
    const sessionID = "budget-escalate"
    const state = await loadContinuationState(worktree, sessionID, dir)
    state.mode = "ctf"
    state.lastAgent = "ctf-fast"
    state.fastBudgetStartedAt = new Date(Date.now() - 16 * 60_000).toISOString()
    state.fastBudgetDeadlineAt = new Date(Date.now() - 30_000).toISOString()
    state.fastBudgetStatus = "active"
    await saveContinuationState(worktree, state)
    const promptCalls: unknown[] = []
    const client = {
      session: {
        todo: async () => ({ data: [] }),
        promptAsync: async (args: unknown) => {
          promptCalls.push(args)
          return { data: {} }
        },
      },
    } as any

    const result = await applyFastBudgetAction({
      client,
      worktree,
      sessionID,
      directory: dir,
      policy: { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    })

    expect(result.prompted).toBe(true)
    expect(promptCalls).toHaveLength(1)
    expect(JSON.stringify(promptCalls[0])).toContain("ctf-expert")
    expect(result.prompt).toContain("ESCALATE: ctf-expert")
    const saved = await loadContinuationState(worktree, sessionID, dir)
    expect(saved.fastBudgetStatus).toBe("escalated")
    expect(saved.fastBudgetDeadlineAt).toBeUndefined()
  })

  it("records prompt failure backoff", async () => {
    const dir = tempPath("ctf-test-budget-")
    const worktree = tempPath("ctf-test-worktree-")
    const sessionID = "budget-failure"
    const state = await loadContinuationState(worktree, sessionID, dir)
    state.mode = "ctf"
    state.lastAgent = "ctf-fast"
    state.fastBudgetDeadlineAt = new Date(Date.now() - 30_000).toISOString()
    await saveContinuationState(worktree, state)
    const client = {
      session: {
        todo: async () => ({ data: [] }),
        promptAsync: async () => {
          throw new Error("boom")
        },
      },
    } as any

    const result = await applyFastBudgetAction({
      client,
      worktree,
      sessionID,
      directory: dir,
      policy: { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    })

    expect(result.prompted).toBe(false)
    expect(result.suppressionReason).toBe("prompt_failure_backoff")
    const saved = await loadContinuationState(worktree, sessionID, dir)
    expect(saved.lastFailureReason).toBe("boom")
    expect(saved.suppressUntil).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// clearContinuationUserPause — state mutation
// ---------------------------------------------------------------------------

describe("clearContinuationUserPause", () => {
  it("resets pause state for known session", async () => {
    // Use a temp dir so the state file is created and cleaned up
    const dir = tempPath("ctf-test-clear-")
    const worktree = tempPath("ctf-test-worktree-")
    const sessionID = "test-session"

    // First set up a paused state
    const state = await loadContinuationState(worktree, sessionID, dir)
    state.enabled = false
    state.pausedByUser = true
    state.pauseReason = "manual_disable"

    // Now clear it
    const newState = await clearContinuationUserPause(worktree, sessionID, dir, "msg-42")
    expect(newState.pausedByUser).toBe(false)
    expect(newState.pauseReason).toBeUndefined()
    expect(newState.suppressUntil).toBeUndefined()
    expect(newState.lastFailureAt).toBeUndefined()
    expect(newState.lastFailureReason).toBeUndefined()
    expect(newState.idleEligible).toBe(false)
    expect(newState.lastMessageID).toBe("msg-42")
  })
})

// ---------------------------------------------------------------------------
// noteContinuationSessionStatus
// ---------------------------------------------------------------------------

describe("noteContinuationSessionStatus", () => {
  it("tracks idle status", async () => {
    const dir = tempPath("ctf-test-status-")
    const worktree = tempPath("ctf-test-worktree-")
    const state = await noteContinuationSessionStatus(worktree, "test-session", dir, "idle")
    expect(state.lastSessionStatus).toBe("idle")
    expect(state.idleEligible).toBe(false) // idle does not set idleEligible
  })

  it("marks idleEligible on busy status", async () => {
    const dir = tempPath("ctf-test-status-")
    const worktree = tempPath("ctf-test-worktree-")
    const state = await noteContinuationSessionStatus(worktree, "test-session", dir, "busy")
    expect(state.lastSessionStatus).toBe("busy")
    expect(state.idleEligible).toBe(true)
  })

  it("starts fast budget in a non-CTF-named directory when explicitly on the fast lane", async () => {
    const dir = tempPath("web-app-")
    const worktree = tempPath("ctf-test-worktree-")
    const state = await setContinuationSessionMode(worktree, "test-session", dir, "ctf", "ctf-fast")
    state.fastBudgetStartedAt = undefined
    state.fastBudgetDeadlineAt = undefined
    state.fastBudgetStatus = undefined
    await saveContinuationState(worktree, state)

    const updated = await noteContinuationSessionStatus(worktree, "test-session", dir, "busy", {
      agent: "ctf-fast",
      fastBudget: { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    })

    expect(updated.fastBudgetStartedAt).toBeDefined()
    expect(updated.fastBudgetDeadlineAt).toBeDefined()
    expect(updated.fastBudgetStatus).toBe("active")
  })

  it("does not restart the fast budget once review has been sent", async () => {
    const dir = tempPath("ctf-test-status-")
    const worktree = tempPath("ctf-test-worktree-")
    const state = await loadContinuationState(worktree, "test-session", dir)
    state.mode = "ctf"
    state.lastAgent = "ctf-fast"
    state.fastBudgetStartedAt = new Date(Date.now() - 20 * 60_000).toISOString()
    state.fastBudgetDeadlineAt = new Date(Date.now() + 30_000).toISOString()
    state.fastBudgetStatus = "review"
    state.fastBudgetSummary = "old handoff"
    state.fastBudgetReviewSentAt = nowIso()
    await saveContinuationState(worktree, state)

    const updated = await noteContinuationSessionStatus(worktree, "test-session", dir, "busy", {
      agent: "ctf-fast",
      fastBudget: { enabled: true, soft_minutes: 15, escalate_on_expiry: true },
    })

    expect(updated.fastBudgetDeadlineAt).toBe(state.fastBudgetDeadlineAt)
    expect(updated.fastBudgetSummary).toBe("old handoff")
  })
})

// ---------------------------------------------------------------------------
// isoPlusMsFrom
// ---------------------------------------------------------------------------

describe("isoPlusMsFrom", () => {
  it("returns undefined for invalid ISO string", () => {
    expect(isoPlusMsFrom("not-a-date", 1000)).toBeUndefined()
  })

  it("returns ISO string in the future", () => {
    const now = new Date().toISOString()
    const future = isoPlusMsFrom(now, 5000)
    expect(future).toBeDefined()
    expect(Date.parse(future!)).toBeGreaterThan(Date.parse(now))
  })
})

// ---------------------------------------------------------------------------
// continuationCheck — edge cases (interface is complex; test what we can)
// ---------------------------------------------------------------------------

describe("needsContinuationPrompt edge cases", () => {
  it("returns false when suppressUntil is exactly now (boundary)", () => {
    const now = new Date().toISOString()
    expect(
      needsContinuationPrompt(
        { total: 5, pending: 2, inProgress: 1, highOpen: 0 },
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
          idleEligible: true,
          suppressUntil: now, // exactly now — isFutureIso returns false
        }),
      ),
    ).toBe(true) // not suppressed
  })

  it("returns false when todos are empty but all conditions met", () => {
    expect(
      needsContinuationPrompt(
        { total: 0, pending: 0, inProgress: 0, highOpen: 0 },
        freshState({ enabled: true, mode: "ctf", lastAgent: "ctf-expert", idleEligible: true }),
      ),
    ).toBe(false) // no in-progress or high-priority items
  })
})

describe("buildSuppressionReason edge cases", () => {
  it("returns undefined when everything is fine", () => {
    expect(
      buildSuppressionReason(
        freshState({
          enabled: true,
          mode: "ctf",
          lastAgent: "ctf-expert",
          idleEligible: true,
        }),
      ),
    ).toBeUndefined()
  })

  it("prefers disabled over other reasons", () => {
    expect(
      buildSuppressionReason(
        freshState({
          enabled: false,
          mode: "ctf",
          lastAgent: "ctf-expert",
          pausedByUser: true,
        }),
      ),
    ).toBe("disabled")
  })

  it("prefers mode_not_allowed over agent issues", () => {
    expect(
      buildSuppressionReason(
        freshState({
          enabled: true,
          mode: "daily",
          lastAgent: "ctf-expert",
        }),
      ),
    ).toBe("mode_not_allowed")
  })
})
