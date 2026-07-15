import type { Hooks, Plugin } from "@opencode-ai/plugin"
import {
  clearContinuationUserPause,
  continuationCheck,
  loadContinuationState,
  markContinuationInterruptedByUser,
  markDirectoryContinuationInterruptedByUser,
  noteContinuationSessionStatus,
} from "./continuation-manager.ts"
import { ensureSkillMcpLeases, releaseSkillMcpLeases } from "./skill-mcp-manager.ts"

const RuntimePlugin: Plugin = async (input, _options) => {
  const hooks: Hooks = {
    event: async ({ event }) => {
      if (event.type === "tui.command.execute") {
        const command = String((event.properties as { command?: string }).command ?? "")
        if (command === "session.interrupt") {
          const properties = event.properties as { sessionID?: string; sessionId?: string }
          const activeSessionID = String((event as unknown as { sessionID?: string }).sessionID ?? properties.sessionID ?? properties.sessionId ?? "")
          if (activeSessionID) {
            await markContinuationInterruptedByUser(input.worktree, activeSessionID, input.directory)
          } else {
            await markDirectoryContinuationInterruptedByUser(input.worktree, input.directory)
          }
          return
        }
      }

      if (event.type === "session.status") {
        const sessionID = String((event.properties as { sessionID?: string }).sessionID ?? "")
        const status = ((event.properties as { status?: { type?: string } }).status?.type || "") as "idle" | "busy" | "retry" | ""
        if (sessionID && (status === "idle" || status === "busy" || status === "retry")) {
          await noteContinuationSessionStatus(input.worktree, sessionID, input.directory, status)
        }
        return
      }

      if (event.type === "session.idle") {
        const sessionID = String((event.properties as { sessionID?: string }).sessionID ?? "")
        if (!sessionID) return

        await continuationCheck({
          client: input.client,
          worktree: input.worktree,
          sessionID,
          directory: input.directory,
        })

        await releaseSkillMcpLeases({
          client: input.client,
          worktree: input.worktree,
          directory: input.directory,
          sessionID,
        })
      }
    },
    "chat.message": async (meta) => {
      const state = await loadContinuationState(input.worktree, meta.sessionID, input.directory)
      if (state.mode === "ctf") return
      await clearContinuationUserPause(input.worktree, meta.sessionID, input.directory, meta.messageID)
    },
    "command.execute.before": async (_meta) => {
      // Continuation resume is controlled explicitly by ctf-continuation-control
      // enable/nudge. Do not clear a user stop just because the user asks for
      // /ctf-continue status or disable.
    },
    "tool.execute.before": async (meta, output) => {
      if (meta.tool !== "skill") return
      const skillName = String(output.args?.name ?? output.args?.skillName ?? "")
      if (!skillName) return
      try {
        await ensureSkillMcpLeases({
          client: input.client,
          worktree: input.worktree,
          directory: input.directory,
          sessionID: meta.sessionID,
          skillName,
        })
      } catch {
        // Skill loading should not fail just because optional dynamic MCP setup failed.
      }
    },
  }

  return hooks
}

export default RuntimePlugin

export const server = RuntimePlugin
