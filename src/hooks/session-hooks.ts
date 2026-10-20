import {
  applyFastBudgetAction,
  clearContinuationUserPause,
  continuationCheck,
  loadContinuationState,
  markContinuationInterruptedByUser,
  markDirectoryContinuationInterruptedByUser,
  noteContinuationSessionStatus,
} from "../continuation-manager.ts"
import { processPendingRequests, releaseSessionMcps } from "../dynamic-mcp-manager.ts"
import { releaseSkillMcpLeases } from "../skill-mcp-manager.ts"
import { clearActivatedDefaults, propObject, propString, trimActivatedDefaults } from "../plugin-support.ts"
import { clearSessionSurface, removePersistedSessionSurface, surfaceAgentForStatus } from "../session-surface.ts"
import { handleTeamEvent } from "../team-runtime.ts"
import { inspectExpertRuntime } from "../expert-watchdog.ts"

function firstNonEmptyString(...values: string[]) {
  return values.find((value) => value !== "") ?? ""
}

export async function handleEventHook(args: {
  event: { type: string; properties?: Record<string, unknown> }
  pluginConfig: any
  input: { client: any; worktree: string; directory: string }
  isHookEnabled: (hook: any) => boolean
  teamEventsEnabled: () => boolean
}) {
  const { event } = args

  if (event.type === "tui.command.execute") {
    const command = propString(event.properties, "command")
    if (command === "session.interrupt") {
      if (!args.isHookEnabled("continuation")) return
      const sessionID = firstNonEmptyString(
        propString(event.properties, "sessionID"),
        propString(event.properties, "sessionId"),
      )
      const activeSessionID = firstNonEmptyString(sessionID, propString(event, "sessionID"))
      if (activeSessionID) {
        await markContinuationInterruptedByUser(args.input.worktree, activeSessionID, args.input.directory)
      } else {
        await markDirectoryContinuationInterruptedByUser(args.input.worktree, args.input.directory)
      }
      return
    }
  }

  if (event.type === "session.status") {
    const sessionID = propString(event.properties, "sessionID")
    const statusObj = propObject<{ type?: string }>(event.properties, "status")
    const status = (statusObj?.type || "") as "idle" | "busy" | "retry" | ""
    if (
      sessionID &&
      (args.isHookEnabled("continuation") || args.pluginConfig.ctf_fast_budget.enabled) &&
      (status === "idle" || status === "busy" || status === "retry")
    ) {
      const rawAgent = firstNonEmptyString(
        propString(event.properties, "agent"),
        propString(event.properties, "agentName"),
        propString(propObject<Record<string, unknown>>(event.properties, "session") ?? {}, "agent"),
      )
      await noteContinuationSessionStatus(args.input.worktree, sessionID, args.input.directory, status, {
        fastBudget: args.pluginConfig.ctf_fast_budget,
        agent: surfaceAgentForStatus(sessionID, rawAgent),
      })
    }
    if (args.teamEventsEnabled()) {
      try {
        await handleTeamEvent(event, args.input.client, args.input.directory, args.input.worktree, {
          maxWorkers: args.pluginConfig.team_mode.max_workers,
          maxJobAttempts: args.pluginConfig.team_mode.max_job_attempts,
        })
      } catch (err) {
        console.warn(
          "[plugin] team event (session.status) failed (non-fatal):",
          err instanceof Error ? err.message : String(err),
        )
      }
    }
    return
  }

  if (event.type === "session.idle") {
    const sessionID = propString(event.properties, "sessionID")
    if (!sessionID) return
    trimActivatedDefaults()

    let continuationSummary: Awaited<ReturnType<typeof continuationCheck>>["summary"] | undefined
    if (args.isHookEnabled("continuation")) {
      const cont = await continuationCheck({
        client: args.input.client,
        worktree: args.input.worktree,
        sessionID,
        directory: args.input.directory,
      })
      continuationSummary = cont.summary
    }

    if (args.pluginConfig.ctf_fast_budget.enabled) {
      await applyFastBudgetAction({
        client: args.input.client,
        worktree: args.input.worktree,
        sessionID,
        directory: args.input.directory,
        policy: args.pluginConfig.ctf_fast_budget,
        summary: continuationSummary,
      })
    }

    if (args.isHookEnabled("skill_mcp")) {
      await releaseSkillMcpLeases({
        client: args.input.client,
        worktree: args.input.worktree,
        directory: args.input.directory,
        sessionID,
      })
    }

    try {
      const result = await processPendingRequests({
        client: args.input.client,
        worktree: args.input.worktree,
        directory: args.input.directory,
        sessionID,
      })
      if (result.processed > 0) {
        console.log(
          `[plugin] mcp-requests: ${result.processed} processed, ${result.autoApproved} auto-approved, ${result.stillPending} still pending`,
        )
      }
    } catch (err) {
      console.warn(
        "[plugin] processPendingRequests failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      )
    }

    if (args.teamEventsEnabled()) {
      try {
        await handleTeamEvent(event, args.input.client, args.input.directory, args.input.worktree, {
          maxWorkers: args.pluginConfig.team_mode.max_workers,
          maxJobAttempts: args.pluginConfig.team_mode.max_job_attempts,
        })
      } catch (err) {
        console.warn(
          "[plugin] team event (session.idle) failed (non-fatal):",
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    if (surfaceAgentForStatus(sessionID, undefined) === "ctf-expert") {
      try {
        const report = await inspectExpertRuntime(args.input.directory, sessionID)
        for (const warning of report.warnings) {
          console.warn(`[plugin] expert-watchdog session=${sessionID.slice(0, 12)}: ${warning}`)
        }
      } catch (err) {
        console.warn("[plugin] expert watchdog failed (non-fatal):", err instanceof Error ? err.message : String(err))
      }
    }
    return
  }

  if (event.type === "session.error" || event.type === "session.deleted") {
    const sessionID = firstNonEmptyString(
      propString(event.properties, "sessionID"),
      propString(event.properties, "sessionId"),
      propString(propObject<Record<string, unknown>>(event.properties, "info") ?? {}, "id"),
    )
    if (event.type === "session.deleted" && sessionID) {
      const agentName =
        firstNonEmptyString(
          propString(event.properties, "agent"),
          propString(event.properties, "agentName"),
          propString(propObject<Record<string, unknown>>(event.properties, "session") ?? {}, "agent"),
          surfaceAgentForStatus(sessionID, undefined) ?? "ctf-fast",
        ) ?? "ctf-fast"
      await releaseSessionMcps({
        client: args.input.client,
        worktree: args.input.worktree,
        directory: args.input.directory,
        sessionID,
        agentName,
      }).catch(() => undefined)
      clearActivatedDefaults(sessionID)
      clearSessionSurface(sessionID)
      await removePersistedSessionSurface(args.input.worktree, sessionID).catch((err) =>
        console.warn("[plugin] session-surface cleanup (non-fatal):", err),
      )
    }
    if (!args.teamEventsEnabled()) return
    try {
      await handleTeamEvent(event, args.input.client, args.input.directory, args.input.worktree, {
        maxWorkers: args.pluginConfig.team_mode.max_workers,
        maxJobAttempts: args.pluginConfig.team_mode.max_job_attempts,
      })
    } catch (err) {
      console.warn(
        "[plugin] team event (session.error/deleted) failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}

export async function handleChatMessageHook(args: {
  meta: { sessionID: string; messageID?: string }
  input: { worktree: string; directory: string }
  isHookEnabled: (hook: any) => boolean
}) {
  if (!args.isHookEnabled("continuation")) return
  const state = await loadContinuationState(args.input.worktree, args.meta.sessionID, args.input.directory)
  if (state.mode === "ctf") return
  await clearContinuationUserPause(args.input.worktree, args.meta.sessionID, args.input.directory, args.meta.messageID)
}
