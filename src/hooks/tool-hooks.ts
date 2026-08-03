import { activateAgentDefaults, clearMcpActivationIssues, recordMcpActivationIssue } from "../dynamic-mcp-manager.ts"
import { getAgentDefaults } from "../agent-mcp-profiles.ts"
import { lookupMcpServer } from "../mcp-server-registry.ts"
import { ensureSkillMcpLeases } from "../skill-mcp-manager.ts"
import { bindingsForSkill } from "../skill-mcp-registry.ts"
import {
  clearFileCache,
  extractHashTags,
  getCachedFile,
  hasActivatedDefaults,
  markActivatedDefaults,
  propString,
  quickHash,
  skillToAgent,
  stripHashTags,
} from "../plugin-support.ts"
import { isCtfSubagent, subagentLightToolSample, toolAllowedForAgent, toolAllowedForSubagent } from "../tool-packs.ts"
import { surfaceAgentForTools } from "../session-surface.ts"
import { enforceExpertToolPolicy } from "../expert-policy.ts"
import { enforceWorkerToolPolicy } from "../worker-policy.ts"

function firstNonEmptyString(...values: string[]) {
  return values.find((value) => value !== "") ?? ""
}

type ToolExecutionRecord = Record<string, any>

function asRecord(value: unknown): ToolExecutionRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as ToolExecutionRecord) : {}
}

/**
 * Normalize the small variations seen in host hook metadata before policy
 * enforcement. Canonical OpenCode fields remain preferred, while aliases
 * prevent an adapter mismatch from silently becoming an anonymous call.
 */
export function normalizeToolExecutionMeta(meta: ToolExecutionRecord, output: ToolExecutionRecord = {}) {
  const records = [
    meta,
    output,
    asRecord(meta.metadata),
    asRecord(meta.context),
    asRecord(output.metadata),
    asRecord(output.context),
  ]
  // Prefer canonical keys globally, not merely within the first metadata
  // container. An adapter may put an alias on `meta` and the canonical field
  // on `output`; record order must not let the alias win in that case.
  const pick = (...keys: string[]) =>
    firstNonEmptyString(...keys.flatMap((key) => records.map((record) => propString(record, key))))
  const nestedAgentNames = records.flatMap((record) => [
    propString(record.agent, "name"),
    propString(record.agent, "type"),
  ])
  const nestedToolNames = records.flatMap((record) => [propString(record.tool, "name"), propString(record.tool, "id")])
  const sessionID = pick("sessionID", "sessionId", "session_id") || undefined
  const toolName = firstNonEmptyString(pick("tool"), pick("toolName", "tool_name"), ...nestedToolNames)
  const rawAgent = firstNonEmptyString(
    pick("agent", "agentName", "agent_name", "agentType", "agent_type"),
    ...nestedAgentNames,
  )
  return { sessionID, toolName, rawAgent }
}

/**
 * Resolve tool arguments across the same adapter envelopes as identity
 * metadata. Keeping this in one place prevents policy checks from seeing the
 * tool name in one envelope while missing protected arguments in another.
 */
export function normalizeToolExecutionArgs(
  meta: ToolExecutionRecord,
  output: ToolExecutionRecord = {},
): Record<string, unknown> {
  const candidates = [
    output.args,
    meta.args,
    asRecord(output.metadata).args,
    asRecord(output.context).args,
    asRecord(meta.metadata).args,
    asRecord(meta.context).args,
  ]
  return (
    (candidates.find(
      (candidate) => candidate !== null && typeof candidate === "object" && !Array.isArray(candidate),
    ) as Record<string, unknown> | undefined) ?? {}
  )
}

export async function handleToolExecuteBefore(args: {
  meta: Record<string, any>
  output: Record<string, any>
  pluginConfig: { disabled_hooks: string[] }
  enabledPacks: Iterable<string>
  input: { client: any; worktree: string; directory: string }
  isHookEnabled: (hook: any) => boolean
  expertReadinessReport: () => { ready: boolean }
  expertReadinessFailureText: (userText?: string, sessionNote?: string) => string
}) {
  const normalized = normalizeToolExecutionMeta(args.meta, args.output)
  const { rawAgent, toolName, sessionID } = normalized
  const agentName = surfaceAgentForTools(sessionID, rawAgent)
  const sessionKey = sessionID ?? ""
  const toolArgs = normalizeToolExecutionArgs(args.meta, args.output)

  await enforceWorkerToolPolicy({
    directory: args.input.directory || args.input.worktree,
    sessionID,
    agentName: rawAgent || agentName,
    toolName,
    toolArgs,
  })

  // Prompt contracts explain the Expert workflow; this gate enforces the
  // entry protocol at the tool boundary so active investigation cannot bypass
  // Team Mode by simply choosing bash or an untracked CTF tool.
  await enforceExpertToolPolicy({
    directory: args.input.directory || args.input.worktree,
    sessionID: typeof sessionID === "string" ? sessionID : undefined,
    agentName,
    toolName,
    toolArgs,
  })

  if (toolName && !toolAllowedForAgent(toolName, agentName)) {
    throw new Error(
      `FastToolSurface: category=fast_surface_blocked tool="${toolName}" surface="${agentName}" ` +
        `remedy="Use a lightweight alternative, escalate to /ctf-expert, or stay within the fast allowlist (triage, fingerprint, probe, flag-grep, python-inline, pwn-runner, …)."`,
    )
  }

  if (toolName && isCtfSubagent(rawAgent) && !toolAllowedForSubagent(toolName, rawAgent, args.enabledPacks)) {
    const sample = subagentLightToolSample(rawAgent, 8)
    throw new Error(
      `SubagentToolGate: tool="${toolName}" requires ctf-expert approval. ` +
        `Agent ${rawAgent} lightweight tools include: ${sample}. ` +
        `Call ctf-dynamic-mcp-advisor action=request tool="${toolName}" ` +
        `with a route-bound justification. Do NOT retry the blocked tool — ` +
        `wait for ctf-expert to approve or deny the request.`,
    )
  }

  if (toolName === "skill") {
    const skillName = firstNonEmptyString(propString(toolArgs, "name"), propString(toolArgs, "skillName"))
    if (!skillName) return

    if (args.isHookEnabled("skill_mcp")) {
      try {
        const result = await ensureSkillMcpLeases({
          client: args.input.client,
          worktree: args.input.worktree,
          directory: args.input.directory,
          sessionID: sessionKey,
          skillName,
        })
        const successfulServers = [...new Set([...result.activated, ...result.shared])]
        if (successfulServers.length) {
          await clearMcpActivationIssues({
            worktree: args.input.worktree,
            sessionID: sessionKey,
            agentName: agentName || rawAgent || "unknown",
            serverNames: successfulServers,
            phase: "skill",
          })
        }
        for (const failure of result.failed) {
          await recordMcpActivationIssue({
            worktree: args.input.worktree,
            sessionID: sessionKey,
            agentName: agentName || rawAgent || "unknown",
            serverName: failure.serverName,
            phase: "skill",
            error: failure.message,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[plugin] ensureSkillMcpLeases failed for skill "${skillName}" (non-fatal): ${msg}`)
        for (const binding of bindingsForSkill(skillName)) {
          await recordMcpActivationIssue({
            worktree: args.input.worktree,
            sessionID: sessionKey,
            agentName: agentName || rawAgent || "unknown",
            serverName: binding.serverName,
            phase: "skill",
            error: err,
          })
        }
      }
    }

    if (skillName === "ctf-expert") {
      const agent = surfaceAgentForTools(sessionKey, rawAgent)
      const readied = args.expertReadinessReport()
      if (!readied.ready) {
        throw new Error(args.expertReadinessFailureText("", `skill ctf-expert requested on surface "${agent}"`))
      }
    }

    if (!hasActivatedDefaults(sessionKey)) {
      const agent = skillToAgent(skillName)
      if (agent && agent !== "ctf-common" && agent !== "ctf-terminal") {
        try {
          let defaultActivationFailedCount = 0
          const defaults = getAgentDefaults(agent)
          if (defaults.length > 0) {
            const result = await activateAgentDefaults({
              client: args.input.client,
              worktree: args.input.worktree,
              directory: args.input.directory,
              sessionID: sessionKey,
              agentName: agent,
            })
            if (result.activated.length > 0) {
              console.log(
                `[plugin] agent-defaults: ${agent} session=${String(sessionKey).slice(0, 12)} activated=[${result.activated.join(", ")}]`,
              )
            }
            if (result.activated.length > 0) {
              await clearMcpActivationIssues({
                worktree: args.input.worktree,
                sessionID: sessionKey,
                agentName: agent,
                serverNames: result.activated,
                phase: "agent_default",
              })
            }
            defaultActivationFailedCount = result.failed?.length ?? 0
          }
          if (defaultActivationFailedCount === 0) {
            markActivatedDefaults(sessionKey)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[plugin] activateAgentDefaults failed for agent "${agent}" (non-fatal): ${msg}`)
          for (const serverName of getAgentDefaults(agent).filter(
            (name) => lookupMcpServer(name)?.weight !== "heavy",
          )) {
            await recordMcpActivationIssue({
              worktree: args.input.worktree,
              sessionID: sessionKey,
              agentName: agent,
              serverName,
              phase: "agent_default",
              error: err,
            })
          }
        }
      } else {
        markActivatedDefaults(sessionKey)
      }
    }
    return
  }

  if (toolName === "edit" && args.isHookEnabled("hashline")) {
    const filePath = propString(args.output.args, "file_path")
    const oldString = propString(args.output.args, "old_string")
    if (!filePath || !oldString) return
    const tags = extractHashTags(oldString)
    if (tags.length === 0) return
    args.output.args.old_string = stripHashTags(oldString)
    const cached = getCachedFile(filePath)
    if (!cached) return

    for (const tag of tags) {
      const actualLine = cached.lines[tag.lineNum - 1]
      if (actualLine === undefined) {
        console.warn(`[plugin] hash-edit: line ${tag.lineNum} beyond file (${cached.lines.length} lines)`)
        throw new Error(
          `HashEditError: line ${tag.lineNum} is beyond the end of the file (${cached.lines.length} lines). The file may have been truncated since your last read.`,
        )
      }
      const actualHash = quickHash(actualLine)
      if (actualHash !== tag.hash) {
        const msg = `HashEditError: content mismatch at line ${tag.lineNum}. Expected hash ${tag.hash} but content is now ${actualHash}. The file changed since your last read.\n  ── Cached content ──\n  ${actualLine.trim()}\n  ── Your old_string ──\n  ${tag.content}\n  Re-read the file with /read and re-construct your edit.`
        console.warn(`[plugin] hash-edit: ${filePath}:${tag.lineNum} hash ${tag.hash} → ${actualHash}`)
        throw new Error(msg)
      }
    }
    clearFileCache(filePath)
  }
}

export async function handleToolExecuteAfter(args: {
  meta: Record<string, any>
  output: Record<string, any>
  isHookEnabled: (hook: any) => boolean
}) {
  const normalized = normalizeToolExecutionMeta(args.meta, args.output)
  const { toolName } = normalized
  const toolArgs = normalizeToolExecutionArgs(args.meta, args.output)
  if (toolName === "read" && args.isHookEnabled("hashline")) {
    const filePath = propString(toolArgs, "file_path")
    if (!filePath || !args.output.output) return
    const lines = String(args.output.output).split("\n")
    if (lines.length === 0) return
    const hasLineNumbers = /^\d+\|/.test(lines[0])
    const tagged = lines.map((line, i) => {
      let clean = hasLineNumbers ? line.replace(/^\d+\|\s?/, "") : line
      clean = clean.replace(/^\d+#[0-9A-Za-z]{1,8}\|\s?/, "")
      const hash = quickHash(clean)
      return `${i + 1}#${hash}| ${clean}`
    })
    const cachedLines = lines.map((line) => {
      let content = hasLineNumbers ? line.replace(/^\d+\|\s?/, "") : line
      return content.replace(/^\d+#[0-9A-Za-z]{1,8}\|\s?/, "")
    })
    clearFileCache(filePath)
    const { setCachedFile } = await import("../plugin-support.ts")
    setCachedFile(filePath, cachedLines)
    args.output.output = tagged.join("\n")
    return
  }

  if (toolName === "grep" || toolName === "glob") {
    if (args.output.output && args.output.output.length > 0) {
      args.output.metadata = args.output.metadata || {}
      args.output.metadata.resultCount = String(args.output.output).split("\n").length
      args.output.metadata.enriched = true
    }
  }
}
