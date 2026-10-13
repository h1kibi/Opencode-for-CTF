import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { PLUGIN_ROOT } from "./asset-paths.ts"
import { getAgentDefaults } from "./agent-mcp-profiles.ts"
import { activateAgentDefaults } from "./dynamic-mcp-manager.ts"
import { recordMcpActivationIssue } from "./dynamic-mcp-manager.ts"
import { lookupMcpServer } from "./mcp-server-registry.ts"
import { explainToolVisibility } from "./capabilities/tool-visibility.ts"
import { toolMetadata } from "./tool-metadata.ts"
import { packForTool, toolAllowedForAgent, type ToolPackId } from "./tool-packs.ts"

export interface HashTag {
  lineNum: number
  hash: string
  content: string
}

const HASH_TAG_RE = /^(\d+)#([0-9A-Za-z]{1,8})\|\s?/gm
const FILE_CACHE_MAX = 30
const FILE_CACHE_TTL_MS = 60_000
const fileReadCache = new Map<string, { lines: string[]; mtime: number }>()
const PLUGIN_TOOL_PREFIXES = ["ctf-", "archive-", "anysearch_", "ctf_rag_", "ctf_rag"]

/**
 * Read-only commands that are safe to auto-allow WITHOUT inspecting argv.
 * Anything that can execute code, touch the network, or trace processes is
 * intentionally NOT here: `python -c`, `node -e`, `npx`, shell wrappers,
 * strace/ltrace etc. must go through permission.ask (see §4.4 of the
 * evaluation report). Prefix matching only approves when the command itself
 * is the first token — argument inspection happens later by policy layer.
 */
const CTF_SAFE_BASH_PREFIXES = [
  "ls",
  "cat",
  "head",
  "tail",
  "file",
  "which",
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
]
const SHELL_CONTROL_OPERATOR_TOKENS = ["&&", "||", ";", "|", ">>", ">", "<", "$(", "`"]

/** Commands that can execute arbitrary code (never auto-allowed). */
const EXECUTE_RISK_PREFIXES = [
  "python",
  "python3",
  "node",
  "tsx",
  "npx",
  "bash",
  "sh",
  "zsh",
  "powershell",
  "pwsh",
  "perl",
  "ruby",
  "php",
  "expect",
]

/** Commands with network side effects (never auto-allowed). */
const NETWORK_RISK_PREFIXES = [
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "nmap",
  "ping",
  "dig",
  "nslookup",
  "ssh",
  "socat",
  "hydra",
  "sqlmap",
  "ffuf",
  "gobuster",
  "feroxbuster",
  "dirsearch",
  "wfuzz",
  "nikto",
]

/** Debug/tracing commands (never auto-allowed). */
const DEBUG_RISK_PREFIXES = ["strace", "ltrace", "gdb", "winedbg", "cdb"]

/** Destructive commands (never auto-allowed; require explicit audit). */
const DESTRUCTIVE_RISK_PREFIXES = [
  "rm",
  "mv",
  "dd",
  "mkfs",
  "shutdown",
  "reboot",
  "kill",
  "pkill",
  "chmod",
  "chown",
  "mkfs.",
]
/**
 * Default MCP profiles already activated, keyed by session *and* agent: a
 * session promoted from the fast lane to the expert lane still needs the expert
 * profile, so a bare per-session flag would suppress it.
 */
const activatedDefaults = new Set<string>()
const ACTIVATED_DEFAULTS_MAX = 100
const activatedDefaultsKey = (sessionID: string, agentName?: string) => `${sessionID}\u0000${agentName ?? "*"}`

export type RuntimeToolRegistrySummary = {
  configPath: string | null
  enabledPacks: string[]
  exportedToolNames: string[]
  exportedToolCount: number
  ctfToolNames: string[]
  ctfToolCount: number
  fastVisibleToolNames: string[]
  fastVisibleToolCount: number
  expertVisibleToolNames: string[]
  expertVisibleToolCount: number
  teamModeEnabled: boolean
  teamToolNames: string[]
  externalSkillsEnabled?: boolean
  skillFilesPresent?: boolean
  expectedSkillNames?: string[]
}

export type ToolVisibilityDiagnosisCategory =
  | "plugin_not_loaded_or_no_ctf_registry"
  | "pack_not_enabled"
  | "tool_not_in_process_registry"
  | "fast_surface_blocked"
  | "subagent_gate_blocked"
  | "visible_in_plugin_registry"
  | "likely_host_schema_not_injected"

export type ToolVisibilityDiagnosis = {
  category: ToolVisibilityDiagnosisCategory
  reasons: string[]
  nextAction: string
}

export function quickHash(s: string): string {
  const norm = s.replace(/\s+$/, "").replace(/\t/g, "  ")
  let hash = 0
  for (let i = 0; i < norm.length; i++) {
    const char = norm.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  if (hash === 0 && norm.length === 0) hash = 5381
  return Math.abs(hash >>> 0)
    .toString(36)
    .toUpperCase()
    .slice(0, 4)
    .padStart(4, "0")
}

export function parseHashTag(line: string): HashTag | null {
  const m = line.match(/^(\d+)#([0-9A-Za-z]{1,8})\|\s?(.*)$/)
  if (!m) return null
  return { lineNum: parseInt(m[1], 10), hash: m[2], content: m[3] }
}

export function stripHashTags(text: string): string {
  return text.replace(HASH_TAG_RE, "")
}

export function extractHashTags(text: string): HashTag[] {
  const tags: HashTag[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const tag = parseHashTag(lines[i])
    if (tag) tags.push(tag)
  }
  return tags
}

export function getCachedFile(filePath: string): { lines: string[]; mtime: number } | undefined {
  const entry = fileReadCache.get(filePath)
  if (!entry) return undefined
  if (Date.now() - entry.mtime > FILE_CACHE_TTL_MS) {
    fileReadCache.delete(filePath)
    return undefined
  }
  return entry
}

export function setCachedFile(filePath: string, lines: string[]): void {
  if (fileReadCache.size >= FILE_CACHE_MAX) {
    const oldest = fileReadCache.keys().next().value
    if (oldest !== undefined) fileReadCache.delete(oldest)
  }
  fileReadCache.set(filePath, { lines, mtime: Date.now() })
}

export function clearFileCache(filePath?: string): void {
  if (filePath) {
    fileReadCache.delete(filePath)
  } else {
    fileReadCache.clear()
  }
}

export function propString(obj: unknown, key: string): string {
  if (typeof obj !== "object" || obj === null) return ""
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === "string" ? val : ""
}

export function propStringNullable(obj: unknown, key: string): string | undefined {
  if (typeof obj !== "object" || obj === null) return undefined
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === "string" ? val : undefined
}

export function propObject<T>(obj: unknown, key: string): T | undefined {
  if (typeof obj !== "object" || obj === null) return undefined
  const val = (obj as Record<string, unknown>)[key]
  if (typeof val === "object" && val !== null) return val as T
  return undefined
}

export function clearActivatedDefaults(sessionID: string): void {
  const prefix = `${sessionID}\u0000`
  for (const key of [...activatedDefaults]) {
    if (key.startsWith(prefix)) activatedDefaults.delete(key)
  }
}

export function trimActivatedDefaults(max = ACTIVATED_DEFAULTS_MAX): void {
  if (activatedDefaults.size <= max) return
  const toDelete = [...activatedDefaults].slice(0, activatedDefaults.size - max)
  for (const id of toDelete) activatedDefaults.delete(id)
}

/** Without an agent name, reports whether any profile was activated for the session. */
export function hasActivatedDefaults(sessionID: string, agentName?: string): boolean {
  if (activatedDefaults.has(activatedDefaultsKey(sessionID, agentName))) return true
  if (agentName !== undefined) return false
  const prefix = `${sessionID}\u0000`
  for (const key of activatedDefaults) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

export function markActivatedDefaults(sessionID: string, agentName?: string): void {
  activatedDefaults.add(activatedDefaultsKey(sessionID, agentName))
}

export type DefaultActivationResult = {
  activated: string[]
  skipped: string[]
  failed: Array<{ serverName: string; message: string }>
  attempted: boolean
}

/**
 * Activate an agent's default MCP profile at most once per session.
 *
 * Both primary lanes reach their profile through this path, because neither has
 * a skill of its own (`skillToAgent` resolves only category and meta skills).
 * A partial or failed activation stays unmarked so the next call retries, and
 * failures are recorded as activation issues instead of thrown: a missing
 * retrieval or browser backend must never block a solve.
 */
export async function activateAgentDefaultsOnce(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  sessionID: string
  agentName: string
}): Promise<DefaultActivationResult> {
  const skippedRun: DefaultActivationResult = { activated: [], skipped: [], failed: [], attempted: false }
  if (!args.sessionID || hasActivatedDefaults(args.sessionID, args.agentName)) return skippedRun

  try {
    const result = await activateAgentDefaults({
      client: args.client,
      worktree: args.worktree,
      directory: args.directory,
      sessionID: args.sessionID,
      agentName: args.agentName,
    })
    const failed = result.failed ?? []
    
    // Record issues for any failures
    for (const failure of failed) {
      await recordMcpActivationIssue({
        worktree: args.worktree,
        sessionID: args.sessionID,
        agentName: args.agentName,
        serverName: failure.serverName,
        phase: "agent_default",
        error: failure.message,
      })
    }
    
    if (failed.length === 0) markActivatedDefaults(args.sessionID, args.agentName)
    return { activated: result.activated, skipped: result.skipped, failed, attempted: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const serverName of getAgentDefaults(args.agentName).filter((name) => lookupMcpServer(name)?.weight !== "heavy")) {
      await recordMcpActivationIssue({
        worktree: args.worktree,
        sessionID: args.sessionID,
        agentName: args.agentName,
        serverName,
        phase: "agent_default",
        error,
      })
    }
    return { activated: [], skipped: [], failed: [{ serverName: "", message }], attempted: true }
  }
}

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
    "ctf-aisec",
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

export type PermissionRisk = "read" | "execute" | "network" | "debug" | "destructive"

export type PermissionClassification = {
  risk: PermissionRisk
  autoAllow: boolean
  reason: string
}

/**
 * Classify a command/tool title into a structured risk level.
 * Only read-only commands are auto-allowed; everything else falls back to
 * permission.ask (and, for destructive/debug, an explicit audit event).
 */
export function classifyBashRisk(title: string): PermissionRisk {
  const t = title.trim().toLowerCase()
  if (DESTRUCTIVE_RISK_PREFIXES.some((prefix) => t.startsWith(prefix))) return "destructive"
  if (DEBUG_RISK_PREFIXES.some((prefix) => t.startsWith(prefix))) return "debug"
  if (NETWORK_RISK_PREFIXES.some((prefix) => t.startsWith(prefix))) return "network"
  if (EXECUTE_RISK_PREFIXES.some((prefix) => t.startsWith(prefix))) return "execute"
  return "execute"
}

function hasShellControlOperators(command: string): boolean {
  return SHELL_CONTROL_OPERATOR_TOKENS.some((token) => command.includes(token))
}

function commandTokens(command: string): string[] {
  return command.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function readOnlyCommandPrefix(command: string): string | undefined {
  const tokens = commandTokens(command)
  if (tokens.length === 0) return undefined
  if (tokens[0] === "git" && tokens.length >= 2) {
    const pair = `${tokens[0]} ${tokens[1]}`
    return CTF_SAFE_BASH_PREFIXES.includes(pair) ? pair : undefined
  }
  return CTF_SAFE_BASH_PREFIXES.includes(tokens[0]) ? tokens[0] : undefined
}

function pluginToolName(permission: { type: string; title: string }): string | undefined {
  const type = (permission.type || "").trim()
  if (PLUGIN_TOOL_PREFIXES.some((prefix) => type.startsWith(prefix))) return type
  const title = (permission.title || "").trim()
  if (PLUGIN_TOOL_PREFIXES.some((prefix) => title.startsWith(prefix))) {
    return title.split(/\s+/)[0]
  }
  return undefined
}

function classifyPluginToolPermission(toolName: string): PermissionClassification {
  const effects = new Set(toolMetadata(toolName).effects)
  if (effects.size === 1 && effects.has("read")) {
    return { risk: "read", autoAllow: true, reason: "tool metadata: read-only" }
  }
  if (effects.has("network")) {
    return { risk: "network", autoAllow: false, reason: "tool metadata includes network side effects" }
  }
  if (effects.has("write")) {
    return { risk: "destructive", autoAllow: false, reason: "tool metadata includes write side effects" }
  }
  if (effects.has("execute")) {
    return { risk: "execute", autoAllow: false, reason: "tool metadata includes execution side effects" }
  }
  if (effects.has("state")) {
    return { risk: "execute", autoAllow: false, reason: "tool metadata includes runtime state mutation" }
  }
  return { risk: "execute", autoAllow: false, reason: "tool metadata is not provably read-only" }
}

function classifyShellCommandPermission(title: string): PermissionClassification {
  const normalized = title.trim().toLowerCase()
  if (!normalized) return { risk: "execute", autoAllow: false, reason: "empty command; not auto-allowed" }
  if (hasShellControlOperators(normalized)) {
    return {
      risk: "execute",
      autoAllow: false,
      reason: "shell control operators present; command is not safely classifiable as read-only",
    }
  }
  const readOnlyPrefix = readOnlyCommandPrefix(normalized)
  if (readOnlyPrefix) {
    return { risk: "read", autoAllow: true, reason: `read-only command prefix ${readOnlyPrefix}` }
  }
  const risk = classifyBashRisk(normalized)
  return { risk, autoAllow: false, reason: `${risk} command; not auto-allowed` }
}

export function classifyCtfPermission(permission: { type: string; title: string }): PermissionClassification {
  const toolName = pluginToolName(permission)
  if (toolName) return classifyPluginToolPermission(toolName)
  return classifyShellCommandPermission(permission.title || "")
}

export function isCtfSafePermission(permission: { type: string; title: string }): boolean {
  return classifyCtfPermission(permission).autoAllow
}
export function titleMatchesSkill(title: string, skillName: string) {
  if (!title || !skillName) return false
  const normalizedTitle = title.toLowerCase()
  const normalizedSkill = skillName.toLowerCase()
  if (normalizedTitle === normalizedSkill) return true
  const prefixes = [`${normalizedSkill} - `, `${normalizedSkill}: `, `${normalizedSkill} — `, `${normalizedSkill} – `]
  for (const prefix of prefixes) {
    if (normalizedTitle.startsWith(prefix)) return true
  }
  return false
}

export function listExpectedSkillNames(baseDir?: string) {
  const candidates = [
    baseDir ? path.resolve(baseDir, "skills") : "",
    path.join(PLUGIN_ROOT, "skills"),
    // Last-resort source-checkout fallback for legacy callers that have not
    // been threaded with an OpenCode context yet. Runtime/plugin entrypoints
    // should pass their workspace directory explicitly.
    baseDir ? "" : path.resolve(process.cwd(), "skills"),
  ].filter(Boolean)

  const names = new Set<string>()
  let skillFilesPresent = false
  for (const skillsDir of candidates) {
    if (!existsSync(skillsDir)) continue
    const local = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(skillsDir, entry.name, "SKILL.md")))
      .map((entry) => entry.name)
    if (local.length) skillFilesPresent = true
    for (const name of local) names.add(name)
  }
  return { skillFilesPresent, names: [...names].sort() }
}

export function diagnoseToolVisibility(input: {
  summary: RuntimeToolRegistrySummary
  toolName?: string | null
  agentSurface?: string | null
  hostSchemaVisible?: boolean | null
}): ToolVisibilityDiagnosis {
  const toolName = input.toolName || undefined
  const agentName = input.agentSurface || "ctf-fast"

  if (input.summary.ctfToolCount === 0) {
    return {
      category: "plugin_not_loaded_or_no_ctf_registry",
      reasons: ["No ctf-* tools were exported from the plugin registry."],
      nextAction:
        "Confirm the plugin loaded successfully, packs were resolved, and OpenCode was restarted after plugin/config changes.",
    }
  }

  if (!toolName) {
    if (input.hostSchemaVisible === false) {
      return {
        category: "likely_host_schema_not_injected",
        reasons: [
          "The plugin exported ctf tools locally, but the live session still does not expose them.",
          "This repo cannot directly inspect the host/model tool schema.",
        ],
        nextAction:
          "Compare this plugin-side export summary against the host/runtime tool schema bridge and session initialization path.",
      }
    }
    return {
      category: "visible_in_plugin_registry",
      reasons: ["The plugin exported ctf tools locally."],
      nextAction:
        "Inspect a specific tool name or compare against the live session tool schema if tools are still not visible to the model.",
    }
  }

  const explanation = explainToolVisibility({
    toolName,
    agentName,
    enabledPacks: input.summary.enabledPacks,
    exportedToolNames: input.summary.exportedToolNames,
  })

  if (!explanation.visible) {
    const category: ToolVisibilityDiagnosisCategory =
      explanation.category === "subagent_gate_blocked"
        ? "subagent_gate_blocked"
        : explanation.category === "visible"
          ? "visible_in_plugin_registry"
          : explanation.category
    return {
      category,
      reasons: explanation.reasons,
      nextAction:
        explanation.category === "pack_not_enabled"
          ? `Enable pack \"${packForTool(toolName)}\" in tool_packs or expert_tool_packs, then restart OpenCode.`
          : explanation.category === "tool_not_in_process_registry"
            ? "Inspect loadCtfTools import warnings, manifest/build outputs, and plugin startup export wiring."
            : explanation.category === "subagent_gate_blocked"
              ? "Have the subagent request approval through ctf-dynamic-mcp-advisor, then let ctf-expert run the heavy tool or adjust the subagent allowlist intentionally."
              : "Use a fast-allowed alternative, inspect the current session surface/tool policy, or ask the user to start the expert lane with /ctf-expert.",
    }
  }

  if (input.hostSchemaVisible === false) {
    return {
      category: "likely_host_schema_not_injected",
      reasons: [
        `${toolName} is exported locally and allowed for the selected surface, but the live session still cannot see it.`,
        "This suggests a host/runtime schema bridge issue outside this repo-local registry check.",
      ],
      nextAction:
        "Inspect how the host session builds the model-visible tool schema from plugin exports and whether the session needs restart/refresh.",
    }
  }

  return {
    category: "visible_in_plugin_registry",
    reasons: explanation.reasons,
    nextAction:
      "If the model still cannot see it, compare this repo-local export result against the live host/runtime tool schema.",
  }
}

export function summarizeRuntimeToolRegistry(input: {
  configPath: string | null
  enabledPacks: Iterable<string>
  tools: Record<string, unknown>
  teamModeEnabled: boolean
  externalSkillsEnabled?: boolean
  expectedSkillNames?: Iterable<string>
  skillFilesPresent?: boolean
}): RuntimeToolRegistrySummary {
  const exportedToolNames = Object.keys(input.tools).sort()
  const ctfToolNames = exportedToolNames.filter((name) => name.startsWith("ctf-") || name.startsWith("archive-")).sort()
  const fastVisibleToolNames = exportedToolNames.filter((name) => toolAllowedForAgent(name, "ctf-fast")).sort()
  const expertVisibleToolNames = exportedToolNames.filter((name) => toolAllowedForAgent(name, "ctf-expert")).sort()
  const teamToolNames = exportedToolNames.filter((name) => name.startsWith("ctf-team-")).sort()
  const expectedSkillNames = [...(input.expectedSkillNames ?? [])].sort()
  return {
    configPath: input.configPath,
    enabledPacks: [...input.enabledPacks].sort(),
    exportedToolNames,
    exportedToolCount: exportedToolNames.length,
    ctfToolNames,
    ctfToolCount: ctfToolNames.length,
    fastVisibleToolNames,
    fastVisibleToolCount: fastVisibleToolNames.length,
    expertVisibleToolNames,
    expertVisibleToolCount: expertVisibleToolNames.length,
    teamModeEnabled: input.teamModeEnabled,
    teamToolNames,
    externalSkillsEnabled: input.externalSkillsEnabled,
    skillFilesPresent: input.skillFilesPresent,
    expectedSkillNames,
  }
}

export function normalizeToolPackId(value: string): ToolPackId {
  return packForTool(value)
}
