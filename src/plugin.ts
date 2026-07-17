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
import { activateAgentDefaults, processPendingRequests } from "./dynamic-mcp-manager.ts"
import { getAgentDefaults } from "./agent-mcp-profiles.ts"
import { loadCtfTools } from "./ctf-tools.ts"
import { createTeamTools, handleTeamEvent, initializeTeamRuntime } from "./team-runtime.ts"
import { isHookEnabled, loadPluginConfig, type PluginUserConfig } from "./plugin-config.ts"
import { toolAllowedForAgent } from "./tool-packs.ts"
import { buildCtfEntryInjection } from "./route-runtime.ts"
import {
  rememberSessionSurface,
  surfaceAgentForTools,
  clearSessionSurface,
} from "./session-surface.ts"

// ---------------------------------------------------------------------------
// Hash-anchored editing — inject content hashes into Read output and verify
// them on Edit, rejecting edits against stale content.
// ---------------------------------------------------------------------------

/**
 * Fast non-cryptographic line-content hash.
 * Returns a 4-character base-36 string suitable for inline tagging.
 */
export function quickHash(s: string): string {
  // Normalise whitespace so cosmetic changes (trailing spaces, tabs→spaces)
  // produce the same hash.
  const norm = s.replace(/\s+$/, "").replace(/\t/g, "  ")
  let hash = 0
  for (let i = 0; i < norm.length; i++) {
    const char = norm.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  // Ensure a minimum seed so empty strings don't hash to "0"
  if (hash === 0 && norm.length === 0) hash = 5381
  return Math.abs(hash >>> 0)
    .toString(36)
    .toUpperCase()
    .slice(0, 4)
    .padStart(4, "0")
}

/** Parsed hash tag from a line like `11#A3F2| content`. */
export interface HashTag {
  lineNum: number
  hash: string
  content: string
}

/**
 * Parse a hash tag from the beginning of a string.
 * Accepts formats: `N#HASH| content`  or  plain `content`.
 */
export function parseHashTag(line: string): HashTag | null {
  const m = line.match(/^(\d+)#([0-9A-Za-z]{1,8})\|\s?(.*)$/)
  if (!m) return null
  return { lineNum: parseInt(m[1], 10), hash: m[2], content: m[3] }
}

const HASH_TAG_RE = /^(\d+)#([0-9A-Za-z]{1,8})\|\s?/gm

/**
 * Strip hash tags from a multiline old_string so the built-in edit tool
 * can match the actual file content.
 */
export function stripHashTags(text: string): string {
  return text.replace(HASH_TAG_RE, "")
}

/**
 * Extract all hash tags from a multiline string.
 */
export function extractHashTags(text: string): HashTag[] {
  const tags: HashTag[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const tag = parseHashTag(lines[i])
    if (tag) tags.push(tag)
  }
  return tags
}

/**
 * Read a file and return its lines as an array.
 * Caches the result so we don't re-read on every edit verification.
 */
const fileReadCache = new Map<string, { lines: string[]; mtime: number }>()
const FILE_CACHE_MAX = 30
const FILE_CACHE_TTL_MS = 60_000

function getCachedFile(filePath: string): { lines: string[]; mtime: number } | undefined {
  const entry = fileReadCache.get(filePath)
  if (!entry) return undefined
  // Expire stale entries so we don't verify against very old cache
  if (Date.now() - entry.mtime > FILE_CACHE_TTL_MS) {
    fileReadCache.delete(filePath)
    return undefined
  }
  return entry
}

function setCachedFile(filePath: string, lines: string[]): void {
  if (fileReadCache.size >= FILE_CACHE_MAX) {
    const oldest = fileReadCache.keys().next().value
    if (oldest !== undefined) fileReadCache.delete(oldest)
  }
  fileReadCache.set(filePath, { lines, mtime: Date.now() })
}

function clearFileCache(filePath?: string): void {
  if (filePath) {
    fileReadCache.delete(filePath)
  } else {
    fileReadCache.clear()
  }
}

// ---------------------------------------------------------------------------
// Safe event-property accessors — shield against undefined / shape changes
// ---------------------------------------------------------------------------

/** Read a string property from an unknown object; returns "" when missing. */
/** @visibleForTesting */
export function propString(obj: unknown, key: string): string {
  if (typeof obj !== "object" || obj === null) return ""
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === "string" ? val : ""
}

/**
 * Read a string property, returning `undefined` when missing or non-string.
 * Unlike `propString`, this distinguishes "property missing" (returns undefined)
 * from "property is empty string" (returns "").
 */
/** @visibleForTesting */
export function propStringNullable(obj: unknown, key: string): string | undefined {
  if (typeof obj !== "object" || obj === null) return undefined
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === "string" ? val : undefined
}

/** Read a nested object property from an unknown object; returns undefined when missing. */
function propObject<T>(obj: unknown, key: string): T | undefined {
  if (typeof obj !== "object" || obj === null) return undefined
  const val = (obj as Record<string, unknown>)[key]
  if (typeof val === "object" && val !== null) return val as T
  return undefined
}

// ---------------------------------------------------------------------------

/** Track which sessions have had their agent MCP defaults activated (lazy init). */
const activatedDefaults = new Set<string>()
const ACTIVATED_DEFAULTS_MAX = 100

/** Remove a session from the activated-defaults set to prevent memory leaks. */
export function clearActivatedDefaults(sessionID: string): void {
  activatedDefaults.delete(sessionID)
  clearSessionSurface(sessionID)
}

/** Enforce a cap on the activated-defaults set by evicting oldest-inserted entries.
 *  @visibleForTesting */
export function trimActivatedDefaults(max = ACTIVATED_DEFAULTS_MAX): void {
  if (activatedDefaults.size <= max) return
  const toDelete = [...activatedDefaults].slice(0, activatedDefaults.size - max)
  for (const id of toDelete) activatedDefaults.delete(id)
}

/**
 * Map a skill name to the most likely CTF agent that loaded it.
 * Skills follow the pattern ctf-{category}-{subskill}.
 */
/** @visibleForTesting */
export function skillToAgent(skillName: string): string | undefined {
  if (!skillName.startsWith("ctf-")) return undefined
  const prefix = skillName.split("-").slice(0, 2).join("-")
  const known = [
    "ctf-web",
    "ctf-pwn",
    "ctf-rev",
    "ctf-crypto",
    "ctf-forensics",
    "ctf-misc",
    "ctf-scout",
    "ctf-oracle",
    "ctf-librarian",
    "ctf-verifier",
    "ctf-retro",
    "ctf-expert",
    "ctf-common",
    "ctf-terminal",
  ]
  return known.includes(prefix) ? prefix : undefined
}

// ---------------------------------------------------------------------------
// Compact message helper for permission.ask auto-allow
// ---------------------------------------------------------------------------

/** Known CTF tools that are safe to auto-allow. */
const CTF_SAFE_TOOL_PREFIXES = ["ctf-", "archive-", "seckb_", "cvekb_", "anysearch_"]

/** Bash command patterns that are always safe for CTF work. */
const CTF_SAFE_BASH_PREFIXES = [
  "ls",
  "cat",
  "head",
  "tail",
  "file",
  "which",
  "python",
  "python3",
  "node",
  "tsx",
  "npx",
  "git status",
  "git log",
  "git diff",
  "objdump",
  "readelf",
  "strings",
  "xxd",
  "hexdump",
  "od",
  "nm",
  "ldd",
  "strace",
  "ltrace",
]

function isCtfSafePermission(permission: { type: string; title: string }): boolean {
  const type = permission.type || ""
  const title = permission.title || ""

  // CTF-specific tools are always safe
  for (const prefix of CTF_SAFE_TOOL_PREFIXES) {
    if (type.startsWith(prefix) || title.startsWith(prefix)) return true
  }

  // Safe bash commands (appear in the title)
  for (const prefix of CTF_SAFE_BASH_PREFIXES) {
    if (title.startsWith(prefix)) return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

const RuntimePlugin: Plugin = async (input, _options) => {
  const pluginConfig: PluginUserConfig = await loadPluginConfig(input.directory)
  // Process-level registry = tool_packs ∪ expert_tool_packs (superset for expert).
  // ctf-fast is narrowed later via FAST_TOOL_ALLOWLIST + session surface.
  const packUnion = [
    ...(pluginConfig.tool_packs ?? []),
    ...(pluginConfig.expert_tool_packs ?? []),
  ]
  const tools = await loadCtfTools({
    packs: packUnion.length ? packUnion : undefined,
  })
  // Merge Team Mode tools into the tool registry
  const teamTools = createTeamTools(input.client, input.directory, input.worktree)
  Object.assign(tools, teamTools)
  // Reconcile any dangling worker sessions on plugin startup
  if (isHookEnabled(pluginConfig, "team_events")) {
    initializeTeamRuntime(input.client, input.directory).catch((err) =>
      console.warn("[plugin] team-runtime init (non-fatal):", err),
    )
  }
  const hooks: Hooks = {
    event: async ({ event }) => {
      if (event.type === "tui.command.execute") {
        const command = propString(event.properties, "command")
        if (command === "session.interrupt") {
          if (!isHookEnabled(pluginConfig, "continuation")) return
          const sessionID = propString(event.properties, "sessionID") || propString(event.properties, "sessionId")
          const activeSessionID = sessionID || propString(event, "sessionID")
          if (activeSessionID) {
            await markContinuationInterruptedByUser(input.worktree, activeSessionID, input.directory)
          } else {
            await markDirectoryContinuationInterruptedByUser(input.worktree, input.directory)
          }
          return
        }
      }

      if (event.type === "session.status") {
        const sessionID = propString(event.properties, "sessionID")
        const statusObj = propObject<{ type?: string }>(event.properties, "status")
        const status = (statusObj?.type || "") as "idle" | "busy" | "retry" | ""
        if (
          isHookEnabled(pluginConfig, "continuation") &&
          sessionID &&
          (status === "idle" || status === "busy" || status === "retry")
        ) {
          await noteContinuationSessionStatus(input.worktree, sessionID, input.directory, status)
        }
        // Team Mode: track worker lifecycle (non-fatal)
        if (isHookEnabled(pluginConfig, "team_events")) {
          try {
            await handleTeamEvent(event, input.client, input.directory)
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

        // Clean up stale activated-defaults entries so the Set doesn't leak memory.
        trimActivatedDefaults()

        if (isHookEnabled(pluginConfig, "continuation")) {
          await continuationCheck({
            client: input.client,
            worktree: input.worktree,
            sessionID,
            directory: input.directory,
          })
        }

        if (isHookEnabled(pluginConfig, "skill_mcp")) {
          await releaseSkillMcpLeases({
            client: input.client,
            worktree: input.worktree,
            directory: input.directory,
            sessionID,
          })
        }

        // Process pending MCP requests from subagents (async approval)
        try {
          const result = await processPendingRequests({
            client: input.client,
            worktree: input.worktree,
            directory: input.directory,
          })
          if (result.processed > 0) {
            console.log(
              `[plugin] mcp-requests: ${result.processed} processed, ${result.autoApproved} auto-approved, ${result.stillPending} still pending`,
            )
          }
        } catch (err) {
          // Non-fatal: MCP request processing runs at session.idle and a
          // transient failure should not block the session.
          console.warn(
            "[plugin] processPendingRequests failed (non-fatal):",
            err instanceof Error ? err.message : String(err),
          )
        }

        // Team Mode: collect finished worker results & notify parent (non-fatal)
        if (isHookEnabled(pluginConfig, "team_events")) {
          try {
            await handleTeamEvent(event, input.client, input.directory)
          } catch (err) {
            console.warn(
              "[plugin] team event (session.idle) failed (non-fatal):",
              err instanceof Error ? err.message : String(err),
            )
          }
        }
      }

      // Team Mode: handle worker session errors and deletions (non-fatal)
      if (event.type === "session.error" || event.type === "session.deleted") {
        if (!isHookEnabled(pluginConfig, "team_events")) return
        try {
          await handleTeamEvent(event, input.client, input.directory)
        } catch (err) {
          console.warn(
            "[plugin] team event (session.error/deleted) failed (non-fatal):",
            err instanceof Error ? err.message : String(err),
          )
        }
        return
      }
    },
    "chat.message": async (meta) => {
      if (!isHookEnabled(pluginConfig, "continuation")) return
      const state = await loadContinuationState(input.worktree, meta.sessionID, input.directory)
      if (state.mode === "ctf") return
      await clearContinuationUserPause(input.worktree, meta.sessionID, input.directory, meta.messageID)
    },
    "command.execute.before": async (_meta, output) => {
      // Continuation resume is controlled explicitly by ctf-continuation-control
      // enable/nudge. Do not clear a user stop just because the user asks for
      // /ctf-continue status or disable.
      //
      // Default /ctf entry: inject BINDING route decision using plugin default_mode.
      const cmd = _meta.command || ""
      if (cmd === "ctf" || cmd === "ctf-solve") {
        output.parts = output.parts || []
        const userText =
          propString(_meta, "arguments") ||
          propString(_meta, "args") ||
          propString(_meta, "text") ||
          propString(output, "text") ||
          ""
        // Best-effort evidence branch detection from free text
        const hasEvidence =
          /\bwork[\\/]+ctf-evidence\b/i.test(userText) || /\bEvidence\.md\b/i.test(userText)
        let injection: string
        let primary: "ctf-fast" | "ctf-expert" = "ctf-fast"
        try {
          const planned = buildCtfEntryInjection({
            userText: userText || "(no challenge text yet — route after first triage)",
            config: pluginConfig,
            hasEvidenceBranch: hasEvidence,
          })
          injection = planned.text
          primary = planned.primary
        } catch (err) {
          injection = `🔴 CTF SOLVE MODE — Call ctf-route-plan first. (route inject failed: ${
            err instanceof Error ? err.message : String(err)
          })`
          if (pluginConfig.default_mode === "expert" || hasEvidence) primary = "ctf-expert"
        }
        if (pluginConfig.default_mode === "expert") {
          injection +=
            "\n\n⚙️ config default_mode=expert — prefer ctf-expert workflow unless route is clearly trivial fast."
        } else if (pluginConfig.default_mode === "fast") {
          injection +=
            "\n\n⚙️ config default_mode=fast — stay on ctf-fast unless signals force expert/resume."
        }
        // Best-effort session agent switch if the harness honors output.agent.
        // OpenCode command frontmatter still says agent: ctf-fast for /ctf — when
        // primary is expert, force a hard handoff instruction so the model does
        // not keep the fast persona.
        if (primary === "ctf-expert") {
          try {
            ;(output as { agent?: string }).agent = "ctf-expert"
          } catch {
            /* harness may ignore */
          }
          injection += [
            "",
            "",
            "⚠️ COMMAND AGENT MAY STILL BE LABELLED ctf-fast — IGNORE THAT LABEL.",
            "IMMEDIATELY call tool `ctf-handoff` with lane=expert (or follow the expert contract below without delay).",
            "You must behave as **ctf-expert** for the rest of this session: Evidence.md, Team Mode, full tools.",
            "Do not use ctf-fast intuition-only workflow.",
          ].join("\n")
        }
        rememberSessionSurface(_meta.sessionID, primary)
        output.parts.push({
          id: "",
          sessionID: _meta.sessionID || "",
          messageID: "",
          type: "text",
          text: injection,
        } as any)
        return
      }
      if (cmd === "ctf-expert") {
        rememberSessionSurface(_meta.sessionID, "ctf-expert")
        output.parts = output.parts || []
        output.parts.push({
          id: "",
          sessionID: _meta.sessionID || "",
          messageID: "",
          type: "text",
          text: `🔴 CTF EXPERT MODE — Binding contract:
- Load skill ctf-expert.
- Maintain Evidence.md via ctf-evidence-board (exactly 3 routes; states untested|blocked|dead|live; blocked≠dead).
- Concurrent subagents for independent work; you orchestrate only.
- Heavy MCP: ctf-mcp-control approve/deny after worker request.
- Flag → return directly and stop (no mandatory flag file).
- Optional: ctf-route-plan mode=expert for category hints.`,
        } as any)
        return
      }
      if (cmd === "ctf-fast") {
        rememberSessionSurface(_meta.sessionID, "ctf-fast")
        output.parts = output.parts || []
        output.parts.push({
          id: "",
          sessionID: _meta.sessionID || "",
          messageID: "",
          type: "text",
          text: `🔴 CTF FAST MODE — Lightweight allowlist only (runtime-enforced).
- No Team Mode, no Evidence.md ceremony, no expert-only tools.
- Shortest path to flag; on collapse output ESCALATE: ctf-expert with clues.`,
        } as any)
      }
    },
    "tool.execute.before": async (meta, output) => {
      // ctf-fast may only use the lightweight tool allowlist (expert keeps full packs).
      // /ctf may stay on command agent ctf-fast while BINDING route is expert — honor session surface.
      const rawAgent =
        propString(meta, "agent") ||
        propString(meta, "agentName") ||
        propString(output, "agent") ||
        propString((meta as { agent?: unknown }).agent, "name")
      const agentName = surfaceAgentForTools(meta.sessionID, rawAgent)
      const toolName = typeof meta.tool === "string" ? meta.tool : ""
      if (
        toolName &&
        (toolName.startsWith("ctf-") || toolName.startsWith("archive-") || toolName === "doc-read" || toolName === "image-file-info") &&
        !toolAllowedForAgent(toolName, agentName)
      ) {
        throw new Error(
          `FastToolSurface: tool "${toolName}" is not available on ctf-fast. ` +
            `Use a lightweight alternative, escalate to /ctf-expert, or stay within the fast allowlist ` +
            `(triage, fingerprint, probe, flag-grep, python-inline, pwn-runner, …).`,
        )
      }

      if (meta.tool === "skill") {
        const skillName = propString(output.args, "name") || propString(output.args, "skillName")
        if (!skillName) return

        // 1) Existing: activate skill-bound MCPs
        if (isHookEnabled(pluginConfig, "skill_mcp")) {
          try {
            await ensureSkillMcpLeases({
              client: input.client,
              worktree: input.worktree,
              directory: input.directory,
              sessionID: meta.sessionID,
              skillName,
            })
          } catch (err) {
            // Non-fatal: skill MCP leasing runs at tool-execute time.  A failure
            // here means the skill will run without its associated MCP servers,
            // which may reduce capability but should not block the task.
            const msg = err instanceof Error ? err.message : String(err)
            console.warn(`[plugin] ensureSkillMcpLeases failed for skill "${skillName}" (non-fatal): ${msg}`)
          }
        }

        // 2) Lazy-activate agent MCP defaults on first skill execution per session.
        if (!activatedDefaults.has(meta.sessionID)) {
          const agent = skillToAgent(skillName)
          if (agent && agent !== "ctf-common" && agent !== "ctf-terminal") {
            try {
              const defaults = getAgentDefaults(agent)
              if (defaults.length > 0) {
                const result = await activateAgentDefaults({
                  client: input.client,
                  worktree: input.worktree,
                  directory: input.directory,
                  sessionID: meta.sessionID,
                  agentName: agent,
                })
                if (result.activated.length > 0) {
                  console.log(
                    `[plugin] agent-defaults: ${agent} session=${meta.sessionID.slice(0, 12)} activated=[${result.activated.join(", ")}]`,
                  )
                }
              }
            } catch (err) {
              // Non-fatal: agent defaults are a best-effort optimization.
              const msg = err instanceof Error ? err.message : String(err)
              console.warn(`[plugin] activateAgentDefaults failed for agent "${agent}" (non-fatal): ${msg}`)
            }
          }
          activatedDefaults.add(meta.sessionID)
        }
        return
      }

      // ---- Hash-anchored edit verification ----
      if (meta.tool === "edit" && isHookEnabled(pluginConfig, "hashline")) {
        const filePath = propString(output.args, "file_path")
        const oldString = propString(output.args, "old_string")
        if (!filePath || !oldString) return

        // Check if old_string contains hash tags
        const tags = extractHashTags(oldString)
        if (tags.length === 0) return // No hash tags → standard edit, pass through

        // Strip hash tags from old_string so the built-in edit can match
        output.args.old_string = stripHashTags(oldString)

        // Verify each tagged line against cache or current file content
        const cached = getCachedFile(filePath)
        if (!cached) return // No cache → best-effort, let edit proceed

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
            const msg = `HashEditError: content mismatch at line ${tag.lineNum}. Expected hash ${tag.hash} but content is now ${actualHash}. The file changed since your last read.
  ── Cached content ──
  ${actualLine.trim()}
  ── Your old_string ──
  ${tag.content}
  Re-read the file with /read and re-construct your edit.`
            console.warn(`[plugin] hash-edit: ${filePath}:${tag.lineNum} hash ${tag.hash} → ${actualHash}`)
            throw new Error(msg)
          }
        }

        // All hashes verified — clear the cache entry so subsequent edits
        // trigger a fresh verification cycle.
        clearFileCache(filePath)
      }
    },
    "tool.execute.after": async (meta, output) => {
      // ---- Hash-anchored tagging on Read ----
      if (meta.tool === "read" && isHookEnabled(pluginConfig, "hashline")) {
        const filePath = typeof meta.args === "object" && meta.args !== null ? propString(meta.args, "file_path") : ""
        if (!filePath || !output.output) return

        const lines = output.output.split("\n")
        if (lines.length === 0) return

        // Detect whether the Read tool includes its own line-number prefix
        // (format `N| content`).  If so, strip it before hashing.
        const hasLineNumbers = /^\d+\|/.test(lines[0])

        const tagged = lines.map((line, i) => {
          // Strip platform line-number prefix if present
          let clean = hasLineNumbers ? line.replace(/^\d+\|\s?/, "") : line
          // Strip any previously injected hash tag (shouldn't occur, but safe)
          clean = clean.replace(/^\d+#[0-9A-Za-z]{1,8}\|\s?/, "")
          const hash = quickHash(clean)
          return `${i + 1}#${hash}| ${clean}`
        })

        // Cache the original (un-prefixed) content for edit verification
        const cachedLines = lines.map((line) => {
          let content = hasLineNumbers ? line.replace(/^\d+\|\s?/, "") : line
          return content.replace(/^\d+#[0-9A-Za-z]{1,8}\|\s?/, "")
        })
        setCachedFile(filePath, cachedLines)

        output.output = tagged.join("\n")
        return
      }

      // ---- Tool result enrichment ----
      if (meta.tool === "grep" || meta.tool === "glob") {
        if (output.output && output.output.length > 0) {
          output.metadata = output.metadata || {}
          output.metadata.resultCount = output.output.split("\n").length
          output.metadata.enriched = true
        }
        return
      }
    },
    "permission.ask": async (input_, output) => {
      if (!isHookEnabled(pluginConfig, "permission_auto_allow")) return
      // Auto-allow CTF-safe tool invocations to reduce permission fatigue
      if (isCtfSafePermission({ type: input_.type, title: input_.title })) {
        output.status = "allow"
      }
    },
    "chat.params": async (_meta, output) => {
      if (!isHookEnabled(pluginConfig, "chat_params")) return
      // CTF agents benefit from low temperature (deterministic analysis)
      // and low top_p (focused reasoning). Only override for CTF sessions.
      const agent = (typeof _meta.agent === "string" ? _meta.agent : "") || ""
      if (!agent.startsWith("ctf-")) return
      if (output.temperature == null || output.temperature > 0.5) {
        output.temperature = 0.2
      }
      if (output.topP == null || output.topP > 0.5) {
        output.topP = 0.1
      }
    },
    "experimental.session.compacting": async (_meta, output) => {
      if (!isHookEnabled(pluginConfig, "session_compacting")) return
      // Preserve CTF-critical context during session compaction.
      // The evidence board, current flag hypothesis, and route state
      // must survive summarisation.
      if (!output.context) output.context = []
      output.context.push(
        "Preserve Evidence.md content and any known flag format exactly.",
        "Keep the current route plan (R1/R2/R3) and their verification status verbatim.",
        "Retain all verified facts and confirmed dead ends.",
        "If a flag has been partially decoded, keep every character.",
        "Preserve any Docker/pcap/binary analysis state.",
      )
    },
  }

  return { ...hooks, tool: tools }
}

export default RuntimePlugin

export const server = RuntimePlugin
