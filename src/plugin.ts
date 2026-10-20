import type { Hooks, Plugin } from "@opencode-ai/plugin"
import path from "node:path"
import { loadCtfToolsWithReport } from "./ctf-tools.ts"
import { createTeamTools, initializeTeamRuntime } from "./team-runtime.ts"
import { isHookEnabled, loadPluginConfigWithPath, type PluginUserConfig } from "./plugin-config.ts"
import { resolveEnabledPacks } from "./tool-packs.ts"
import { persistSessionSurface, rememberSessionSurface, restoreSessionSurfaces } from "./session-surface.ts"
import { evaluateExpertReadiness, extractResumeHints, formatExpertReadinessFailure } from "./expert-readiness.ts"
import { listExpectedSkillNames, summarizeRuntimeToolRegistry } from "./plugin-support.ts"
import { runtimeStateRoot } from "./paths.ts"
import { saveJsonFile } from "./state-store.ts"
import { handleCommandExecuteBefore } from "./hooks/command-hooks.ts"
import { handleToolExecuteAfter, handleToolExecuteBefore } from "./hooks/tool-hooks.ts"
import { handleChatParams, handleSessionCompacting } from "./hooks/chat-and-diagnostic-hooks.ts"
import { handlePermissionAsk } from "./hooks/permission-hooks.ts"
import { handleChatMessageHook, handleEventHook } from "./hooks/session-hooks.ts"

// Keep the plugin entry module limited to the actual OpenCode entry points below.
// OpenCode enumerates callable named exports while loading a plugin; exporting
// diagnostic helpers here makes the host invoke them as plugins with PluginInput,
// which is not their helper argument shape. Import those helpers directly from
// `plugin-support.ts` in tests/tools instead.

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

function looksLikeFilesystemRoot(worktree: string): boolean {
  return /^[a-zA-Z]:[\\/]$/.test(worktree) || worktree === "/" || worktree === "\\"
}

/**
 * Wrap a side-effect hook so an unexpected failure degrades to a warning
 * instead of killing message/session processing. Hooks that use throw as a
 * control-flow gate (tool.execute.before, command.execute.before) are NOT
 * wrapped.
 */
function safeHook<Args extends unknown[], Out>(name: string, fn: (...args: Args) => Promise<Out> | Out) {
  return async (...args: Args): Promise<Out | undefined> => {
    try {
      return await fn(...args)
    } catch (err) {
      console.warn(`[plugin] hook ${name} failed (non-fatal):`, err instanceof Error ? err.message : String(err))
      return undefined
    }
  }
}

// OpenCode 2.x compatibility guard
if (process.env.OPENCODE_VERSION?.startsWith("2.")) {
  throw new Error(
    "OpenCode 2.x requires plugin migration. Current plugin supports OpenCode 1.18.x - 1.19.x only. " +
      "See https://github.com/h1kibi/Opencode-for-CTF#compatibility for details.",
  )
}

const RuntimePlugin: Plugin = async (input, _options) => {
  // opencode desktop may report a filesystem root (e.g. "C:\\") as the
  // worktree for projects without a detected VCS root. State files written
  // under a drive root scatter across the machine and are easy to corrupt;
  // normalize to the real project directory instead.
  if (input.worktree && looksLikeFilesystemRoot(input.worktree)) {
    input.worktree = input.directory
  }
  await restoreSessionSurfaces(input.worktree || input.directory).catch((err) =>
    console.warn("[plugin] session-surface restore (non-fatal):", err),
  )
  const loaded = await loadPluginConfigWithPath(input.directory)
  const pluginConfig: PluginUserConfig = loaded.config
  const pluginConfigPath = loaded.path
  // Process-level registry = tool_packs ∪ expert_tool_packs (superset for expert).
  // ctf-fast is narrowed later via FAST_TOOL_ALLOWLIST + session surface.
  const packUnion = [...(pluginConfig.tool_packs ?? []), ...(pluginConfig.expert_tool_packs ?? [])]
  const enabledPacks = resolveEnabledPacks(packUnion.length ? packUnion : undefined)
  const { tools, report: toolLoadReport } = await loadCtfToolsWithReport({
    packs: [...enabledPacks],
  })
  const expectedSkills = listExpectedSkillNames(input.directory)
  // Team Mode tools are only registered when config enables them (requires restart).
  if (pluginConfig.team_mode.enabled) {
    const teamTools = createTeamTools(input.client, input.directory, input.worktree, {
      maxWorkers: pluginConfig.team_mode.max_workers,
      maxJobAttempts: pluginConfig.team_mode.max_job_attempts,
      runtimeVisibility: {
        surface: "ctf-expert",
        pluginToolCount: Object.keys(tools).length,
        expectedSkills: expectedSkills.names,
        externalSkillsEnabled: pluginConfig.external_skills,
        exportedToolNames: Object.keys(tools),
      },
    })
    Object.assign(tools, teamTools)
  }
  // Reconcile any dangling worker sessions on plugin startup
  if (teamEventsEnabled()) {
    initializeTeamRuntime(input.client, input.directory, input.worktree, {
      maxWorkers: pluginConfig.team_mode.max_workers,
      maxJobAttempts: pluginConfig.team_mode.max_job_attempts,
    }).catch((err) =>
      console.warn("[plugin] team-runtime init (non-fatal):", err),
    )
  }
  const registeredToolNames = Object.keys(tools)
  const toolRegistrySummary = summarizeRuntimeToolRegistry({
    configPath: pluginConfigPath,
    enabledPacks,
    tools,
    teamModeEnabled: pluginConfig.team_mode.enabled,
    externalSkillsEnabled: pluginConfig.external_skills,
    expectedSkillNames: expectedSkills.names,
    skillFilesPresent: expectedSkills.skillFilesPresent,
  })
  console.log(
    `[plugin] runtime-tools: exported=${toolRegistrySummary.exportedToolCount} ctf=${toolRegistrySummary.ctfToolCount} fast=${toolRegistrySummary.fastVisibleToolCount} expert=${toolRegistrySummary.expertVisibleToolCount} packs=${toolRegistrySummary.enabledPacks.join(",")} external_skills=${toolRegistrySummary.externalSkillsEnabled ? "on" : "off"} skills=${toolRegistrySummary.expectedSkillNames?.length ?? 0}`,
  )

  // Structured tool-load report: import failures / missing critical tools
  // must be visible at startup instead of a silent green.
  if (toolLoadReport.failed.length || toolLoadReport.criticalMissing.length) {
    console.warn(
      `[plugin] tool-load: failed=${toolLoadReport.failed.length} critical_missing=${toolLoadReport.criticalMissing.length}`,
    )
    for (const failure of toolLoadReport.failed) {
      console.warn(
        `[plugin] tool-load ${failure.stage} FAILED ${failure.relative}${failure.critical ? " [CRITICAL]" : ""}: ${failure.error}`,
      )
    }
  }
  try {
    await saveJsonFile(
      path.join(runtimeStateRoot(input.worktree || input.directory), "tool-load-report.json"),
      toolLoadReport,
    )
  } catch (err) {
    console.warn("[plugin] failed to persist tool-load report (non-fatal):", err)
  }

  function expertReadinessReport() {
    return evaluateExpertReadiness({
      registeredTools: registeredToolNames,
      teamModeEnabled: pluginConfig.team_mode.enabled,
      maxWorkers: pluginConfig.team_mode.max_workers,
      toolPacks: pluginConfig.tool_packs,
      expertToolPacks: pluginConfig.expert_tool_packs,
      configPath: pluginConfigPath,
    })
  }

  function expertReadinessFailureText(userText = "", sessionNote?: string) {
    const report = expertReadinessReport()
    const resume = extractResumeHints(userText)
    return formatExpertReadinessFailure(report, {
      challengeText: userText,
      handoffPath: resume.handoffPath,
      evidencePath: resume.evidencePath,
      sessionNote,
    })
  }



  function teamEventsEnabled() {
    return pluginConfig.team_mode.enabled && isHookEnabled(pluginConfig, "team_events")
  }

  function requireExpertReadiness(userText = "", sessionNote?: string) {
    const report = expertReadinessReport()
    if (!report.ready) throw new Error(expertReadinessFailureText(userText, sessionNote))
  }

  function promoteExpertSurface(sessionID: string | undefined | null, source: "explicit" | "route" = "explicit") {
    rememberSessionSurface(sessionID ?? undefined, "ctf-expert")
    void persistSessionSurface(input.worktree || input.directory, sessionID, "ctf-expert", source).catch((err) =>
      console.warn("[plugin] session-surface persist (non-fatal):", err),
    )
  }

  function promoteFastSurface(sessionID: string | undefined | null, source: "explicit-fast" = "explicit-fast") {
    rememberSessionSurface(sessionID ?? undefined, "ctf-fast")
    void persistSessionSurface(input.worktree || input.directory, sessionID, "ctf-fast", source).catch((err) =>
      console.warn("[plugin] session-surface persist (non-fatal):", err),
    )
  }

  const hooks: Hooks = {
    event: safeHook("event", async ({ event }) => {
      await handleEventHook({
        event,
        pluginConfig,
        input,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
        teamEventsEnabled,
      })
    }),
    "chat.message": safeHook("chat.message", async (meta) => {
      await handleChatMessageHook({
        meta,
        input,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
      })
    }),
    "command.execute.before": async (_meta, output) => {
      await handleCommandExecuteBefore({
        meta: _meta as Record<string, unknown>,
        output: output as Record<string, any>,
        pluginConfig,
        worktree: input.worktree,
        directory: input.directory,
        expertReadinessReport,
        expertReadinessFailureText,
        requireExpertReadiness,
        promoteExpertSurface,
        promoteFastSurface,
      })
    },
    "tool.execute.before": async (meta, output) => {
      await handleToolExecuteBefore({
        meta: meta as Record<string, any>,
        output: output as Record<string, any>,
        pluginConfig,
        enabledPacks,
        input,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
        expertReadinessReport,
        expertReadinessFailureText,
      })
    },
    "tool.execute.after": safeHook("tool.execute.after", async (meta, output) => {
      await handleToolExecuteAfter({
        meta: meta as Record<string, any>,
        output: output as Record<string, any>,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
      })
    }),
    "permission.ask": safeHook("permission.ask", async (input_, output) => {
      await handlePermissionAsk({
        input: input_,
        output,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
      })
    }),
    "chat.params": safeHook("chat.params", async (_meta, output) => {
      await handleChatParams({
        meta: _meta,
        output,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
      })
    }),
    "experimental.session.compacting": safeHook("experimental.session.compacting", async (_meta, output) => {
      await handleSessionCompacting({
        output,
        isHookEnabled: (hook) => isHookEnabled(pluginConfig, hook),
      })
    }),
  }

  return { ...hooks, tool: tools }
}

export default RuntimePlugin

export const server = RuntimePlugin
