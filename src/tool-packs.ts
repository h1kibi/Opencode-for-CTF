/**
 * Tool pack classification and selection.
 *
 * Packs reduce the OpenCode tool schema surface: only enabled packs are
 * imported/registered at plugin startup. Category packs follow tool name
 * prefixes; rare packs (android/godot) stay opt-in.
 */

export type ToolPackId =
  | "core"
  | "web"
  | "pwn"
  | "rev"
  | "crypto"
  | "forensics"
  | "misc"
  | "android"
  | "godot"
  | "java"

export const ALL_TOOL_PACKS: ToolPackId[] = [
  "core",
  "web",
  "pwn",
  "rev",
  "crypto",
  "forensics",
  "misc",
  "android",
  "godot",
  "java",
]

/** Default packs registered without user config (main CTF categories, not rare specialists). */
export const DEFAULT_TOOL_PACKS: ToolPackId[] = [
  "core",
  "web",
  "pwn",
  "rev",
  "crypto",
  "forensics",
  "misc",
  "java",
]

/**
 * Lightweight tools allowed for ctf-fast primary sessions.
 * Expert / specialists keep the full pack-filtered registry; fast must stay small
 * so the model is not distracted by heap mappers, team tools, or rare specialists.
 */
export const FAST_TOOL_ALLOWLIST = new Set([
  // routing / triage
  "ctf-route-plan",
  "ctf-tool-packs",
  "ctf-file-triage",
  "ctf-one-shot-triage",
  "ctf-quick-triage",
  "ctf-binary-probe",
  "ctf-flag-grep",
  "archive-safe-extract",
  "ctf-safe-extract",
  "doc-read",
  "image-file-info",
  // web light
  "ctf-web-fingerprint",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  // pwn light
  "ctf-pwn-runner",
  "ctf-pwn-check-env",
  // crypto / forensics light
  "ctf-rsa-probe",
  "ctf-pcap-probe",
  "ctf-stego-probe",
  "ctf-image-open",
  // scripting helpers
  "ctf-python-inline",
  "ctf-ensure-dir",
  // MCP advisor (request only; expert approves heavy)
  "ctf-dynamic-mcp-advisor",
  // env check — all agents should verify environment readiness
  "ctf-env-check",
  // artifact analysis — all agents should analyze challenge files
  "ctf-artifact-analyze",
  // hard lane switch when /ctf command agent stays ctf-fast
  "ctf-handoff",
])

/** Agents that use the fast tool surface (exact names). */
export const FAST_TOOL_AGENTS = new Set(["ctf-fast"])

export function isFastToolAgent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  return FAST_TOOL_AGENTS.has(agentName)
}

/**
 * Whether a tool may run for the given agent after pack filtering.
 * Non-fast agents: all pack-allowed tools. Fast: allowlist only.
 */
export function toolAllowedForAgent(toolName: string, agentName?: string | null): boolean {
  if (!isFastToolAgent(agentName)) return true
  return FAST_TOOL_ALLOWLIST.has(toolName)
}

/** Always-on tools regardless of category. */
const CORE_EXACT = new Set([
  "archive-safe-extract",
  "ctf-safe-extract",
  "ctf-background-job",
  "ctf-binary-probe",
  "ctf-continuation-control",
  "ctf-decision-state",
  "ctf-decompose-task",
  "ctf-dynamic-mcp-advisor",
  "ctf-ensure-dir",
  "ctf-artifact-analyze",
  "ctf-env-check",
  "ctf-evidence-board",
  "ctf-file-triage",
  "ctf-file-write-matrix",
  "ctf-flag-grep",
  "ctf-lesson-index-audit",
  "ctf-lesson-modifier-plan",
  "ctf-lesson-search",
  "ctf-local-harness-verifier",
  "ctf-one-shot-triage",
  "ctf-pattern-card-search",
  "ctf-pattern-curation-report",
  "ctf-pattern-feedback",
  "ctf-pattern-to-hypothesis",
  "ctf-python-inline",
  "ctf-python-parallel",
  "ctf-quick-triage",
  "ctf-route-plan",
  "ctf-runtime-selftest",
  "ctf-skill-mcp-lifecycle",
  "ctf-skill-repo-search",
  "ctf-source-first-pack",
  "ctf-source-map-read",
  "ctf-team-mode",
  "ctf-tool-packs",
  "ctf-mcp-control",
  "ctf-handoff",
  "ctf-whitebox-env-check",
  "ctf-whitebox-handoff",
  "doc-read",
  "image-file-info",
])

const PREFIX_RULES: Array<{ prefix: string; pack: ToolPackId }> = [
  { prefix: "ctf-android-", pack: "android" },
  { prefix: "ctf-apk-", pack: "android" },
  { prefix: "ctf-dex-", pack: "android" },
  { prefix: "ctf-jadx-", pack: "android" },
  { prefix: "ctf-godot-", pack: "godot" },
  { prefix: "ctf-java-", pack: "java" },
  { prefix: "ctf-web-", pack: "web" },
  { prefix: "ctf-waf-", pack: "web" },
  { prefix: "ctf-api-map", pack: "web" },
  { prefix: "ctf-pwn-", pack: "pwn" },
  { prefix: "ctf-elf-", pack: "pwn" },
  { prefix: "ctf-rev-", pack: "rev" },
  { prefix: "ctf-go-", pack: "rev" },
  { prefix: "ctf-windows-gui-", pack: "rev" },
  { prefix: "ctf-rsa-", pack: "crypto" },
  { prefix: "ctf-pcap-", pack: "forensics" },
  { prefix: "ctf-stego-", pack: "forensics" },
  { prefix: "ctf-image-open", pack: "forensics" },
  { prefix: "ctf-media-open", pack: "forensics" },
  { prefix: "ctf-artifact-page", pack: "forensics" },
]

/**
 * Assign a tool basename (no extension) to a pack.
 * Unknown tools fall into core so they stay available by default.
 */
export function packForTool(toolName: string): ToolPackId {
  if (CORE_EXACT.has(toolName)) return "core"
  for (const rule of PREFIX_RULES) {
    if (toolName === rule.prefix || toolName.startsWith(rule.prefix)) return rule.pack
  }
  // Generic helpers without a clear category stay core.
  if (toolName.startsWith("ctf-")) return "core"
  return "core"
}

export function isToolPackId(value: string): value is ToolPackId {
  return (ALL_TOOL_PACKS as string[]).includes(value)
}

/**
 * Resolve the pack set from user config / env.
 * - missing → DEFAULT_TOOL_PACKS
 * - includes "all" → every pack
 * - otherwise → union with "core" always forced on
 */
export function resolveEnabledPacks(requested?: string[] | null): Set<ToolPackId> {
  const envRaw = process.env.OPENCODE_CTF_TOOL_PACKS
  const fromEnv = envRaw
    ? envRaw
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : []
  const fromConfig = (requested ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)
  const tokens = fromConfig.length ? fromConfig : fromEnv

  if (!tokens.length) return new Set(DEFAULT_TOOL_PACKS)
  if (tokens.includes("all") || tokens.includes("*")) return new Set(ALL_TOOL_PACKS)

  const enabled = new Set<ToolPackId>(["core"])
  for (const token of tokens) {
    if (isToolPackId(token)) enabled.add(token)
  }
  return enabled
}

export function toolAllowedByPacks(toolName: string, enabled: Set<ToolPackId>): boolean {
  return enabled.has(packForTool(toolName))
}

/** Summarize pack membership for diagnostics. */
export function summarizePacks(toolNames: string[]): Record<ToolPackId, string[]> {
  const out = Object.fromEntries(ALL_TOOL_PACKS.map((p) => [p, [] as string[]])) as Record<
    ToolPackId,
    string[]
  >
  for (const name of toolNames) {
    out[packForTool(name)].push(name)
  }
  for (const pack of ALL_TOOL_PACKS) out[pack].sort()
  return out
}
