import { tool } from "@opencode-ai/plugin"
import { createRuntimeClient } from "../src/sdk.ts"
import {
  clearContinuationUserPause,
  continuationCheck,
  loadContinuationState,
  saveContinuationState,
} from "../src/continuation-manager.ts"

export default tool({
  description:
    "CTF continuation control: inspect, enable, disable, or manually trigger automatic continuation / todo enforcement state for the current session.",
  args: {
    operation: tool.schema.string().describe("status | enable | disable | nudge"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const client = createRuntimeClient(context.directory)
    const state = await loadContinuationState(context.worktree, context.sessionID, context.directory)

    if (args.operation === "enable") {
      state.enabled = true
      state.lastAgent = context.agent
      state.pausedByUser = false
      state.pauseReason = undefined
      state.suppressUntil = undefined
      await saveContinuationState(context.worktree, state)
      await clearContinuationUserPause(context.worktree, context.sessionID, context.directory)
      const payload = { operation: "enable", sessionID: context.sessionID, enabled: true, pausedByUser: false }
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : `ctf_continuation_control:\noperation: enable\nsessionID: ${context.sessionID}\nenabled: true\npausedByUser: false`
    }

    if (args.operation === "disable") {
      state.enabled = false
      state.pausedByUser = true
      state.pauseReason = "manual_disable"
      state.suppressUntil = undefined
      await saveContinuationState(context.worktree, state)
      const payload = {
        operation: "disable",
        sessionID: context.sessionID,
        enabled: false,
        pausedByUser: true,
        pauseReason: "manual_disable",
      }
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : `ctf_continuation_control:\noperation: disable\nsessionID: ${context.sessionID}\nenabled: false\npausedByUser: true\npauseReason: manual_disable`
    }

    if (args.operation === "nudge") {
      await clearContinuationUserPause(context.worktree, context.sessionID, context.directory)
      const result = await continuationCheck({
        client,
        worktree: context.worktree,
        sessionID: context.sessionID,
        directory: context.directory,
        agent: context.agent,
        lastMessageID: context.messageID,
        force: true,
      })
      return args.jsonOnly
        ? JSON.stringify(result, null, 2)
        : [
            "ctf_continuation_control:",
            "operation: nudge",
            `shouldNudge: ${result.shouldNudge}`,
            `pending: ${result.summary.pending}`,
            `inProgress: ${result.summary.inProgress}`,
            `highOpen: ${result.summary.highOpen}`,
            result.prompt ? `prompt: ${result.prompt}` : "prompt:",
          ].join("\n")
    }

    return args.jsonOnly
      ? JSON.stringify(state, null, 2)
      : [
          "ctf_continuation_control:",
          "operation: status",
          `sessionID: ${state.sessionID}`,
          `enabled: ${state.enabled}`,
          `pausedByUser: ${state.pausedByUser ?? false}`,
          `pauseReason: ${state.pauseReason ?? ""}`,
          `suppressUntil: ${state.suppressUntil ?? ""}`,
          `lastNudgeKey: ${state.lastNudgeKey ?? ""}`,
          `lastFailureAt: ${state.lastFailureAt ?? ""}`,
          `lastFailureReason: ${state.lastFailureReason ?? ""}`,
          `lastSessionStatus: ${state.lastSessionStatus ?? ""}`,
          `idleEligible: ${state.idleEligible ?? false}`,
          `mode: ${state.mode}`,
          `lastAgent: ${state.lastAgent ?? ""}`,
          `lastTodoSummary: ${state.lastTodoSummary ?? ""}`,
          `lastNudgeAt: ${state.lastNudgeAt ?? ""}`,
        ].join("\n")
  },
})
