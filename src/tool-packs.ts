/**
 * Tool pack classification and selection.
 *
 * Packs reduce the OpenCode tool schema surface: only enabled packs are
 * imported/registered at plugin startup. Category packs follow tool name
 * prefixes; rare packs (android/godot) stay opt-in.
 *
 * Agent equipment (tool authorization, MCP defaults) moved to agent-equipment-policy.ts.
 */

// Re-export agent equipment functions for existing consumers
export {
  FAST_TOOL_ALLOWLIST,
  FAST_MCP_SERVER_PREFIXES,
  FAST_MCP_TOOL_NAMES,
  toolAllowedForAgent,
  toolAllowedForSubagent,
  isFastToolAgent,
  isCtfSubagent,
  subagentLightToolSample,
  SUBAGENT_LIGHT_TOOLS,
} from "./agent-equipment-policy.ts"

export type ToolPackId =
  | "core"
  | "web"
  | "pwn"
  | "rev"
  | "crypto"
  | "forensics"
  | "misc"
  | "aisec"
  | "maintenance"
  | "android"
  | "godot"
  | "java"
  | "pwn-heavy"
  | "web-heavy"
  | "rev-heavy"
  | "android-dynamic"
  | "forensics-heavy"
export const ALL_TOOL_PACKS: ToolPackId[] = [
  "core",
  "web",
  "pwn",
  "rev",
  "crypto",
  "forensics",
  "misc",
  "aisec",
  "maintenance",
  "android",
  "godot",
  "java",
  "pwn-heavy",
  "web-heavy",
  "rev-heavy",
  "android-dynamic",
  "forensics-heavy",
]

const TOOL_PACK_ALIASES: Record<string, ToolPackId> = {
  "java-heavy": "java",
}

/** Default packs registered without user config (main CTF categories, not rare specialists). */
export const DEFAULT_TOOL_PACKS: ToolPackId[] = ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "aisec"]

/** Always-on tools regardless of category. */
const CORE_EXACT = new Set([
  "archive-safe-extract",
  "ctf-safe-extract",
  "ctf-binary-probe",
  "ctf-elf-slice",
  "ctf-decision-state",
  "ctf-decompose-task",
  "ctf-dynamic-mcp-advisor",
  "ctf-ensure-dir",
  "ctf-artifact-analyze",
  "ctf-env-check",
  "ctf-evidence-board",
  "ctf-flag-verify",
  "ctf-file-triage",
  "ctf-flag-grep",
  "ctf-one-shot-triage",
  "ctf-python-inline",
  "ctf-route-plan",
  "ctf-team-mode",
  "ctf-tool-packs",
  "ctf-mcp-control",
  "ctf-java-analyze",
  "doc-read",
  "image-file-info",
])

const MAINTENANCE_EXACT = new Set([
  "ctf-background-job",
  "ctf-continuation-control",
  "ctf-file-write-matrix",
  "ctf-python-parallel",
  "ctf-runtime-selftest",
  "ctf-skill-mcp-lifecycle",
])

const PWN_HEAVY_EXACT = new Set([
  "ctf-pwn-docker-harness",
  "ctf-pwn-docker-runner",
  "ctf-pwn-expect-runner",
  "ctf-pwn-gdb-snapshot",
  "ctf-local-harness-verifier",
  "ctf-pwn-adjacency-audit",
  "ctf-pwn-closure-router",
  "ctf-pwn-container-probe",
  "ctf-pwn-crash-probe",
  "ctf-pwn-disasm-constraint-map",
  "ctf-pwn-experiment-ledger",
  "ctf-pwn-format-map",
  "ctf-pwn-got-leak-router",
  "ctf-pwn-heap-leak-classifier",
  "ctf-pwn-heap-menu-map",
  "ctf-pwn-heap-overlap-mapper",
  "ctf-pwn-heap-reduction-check",
  "ctf-pwn-heap-state-diff",
  "ctf-pwn-heap-transaction-recorder",
  "ctf-pwn-io-diff-check",
  "ctf-pwn-leak-ledger",
  "ctf-pwn-libc-fingerprint",
  "ctf-pwn-libc-resolver",
  "ctf-pwn-libc-runtime-doctor",
  "ctf-pwn-linux-session",
  "ctf-pwn-leak-stability-check",
  "ctf-pwn-menu-contract-probe",
  "ctf-pwn-payload-artifact",
  "ctf-pwn-persist-probe",
  "ctf-pwn-playbook-router",
  "ctf-pwn-post-shell-runner",
  "ctf-pwn-primitive-compressor",
  "ctf-pwn-redflag-panel",
  "ctf-pwn-remote-check",
  "ctf-pwn-remote-drift-check",
  "ctf-pwn-ret2csu-check",
  "ctf-pwn-rop-summary",
  "ctf-pwn-runbox",
  "ctf-pwn-runtime-lock",
  "ctf-pwn-shortest-primitive",
  "ctf-pwn-stack-frame-solver",
  "ctf-pwn-stage-delta-runner",
  "ctf-pwn-stage-harness",
  "ctf-pwn-stdin-segment-map",
  "ctf-pwn-syscall-orw-check",
  "ctf-pwn-template-init",
  "ctf-pwn-vm-bytecode-helper",
  "ctf-pwn-wp-diff",
  "ctf-pwn-wsl-runner",
])

const WEB_HEAVY_EXACT = new Set([
  "ctf-source-first-pack",
  "ctf-source-map-read",
  "ctf-waf-bypass-plan",
  "ctf-web-recon-pack",
  "ctf-web-authz-matrix",
  "ctf-web-diff-probe",
  "ctf-web-fuzz-plan",
  "ctf-web-js-surface-map",
  "ctf-web-pattern-search",
  "ctf-web-reflection-map",
  "ctf-web-runtime-map",
  "ctf-web-state-machine-map",
  "ctf-web-template-check",
  "ctf-web-url-corpus",
  "ctf-web-blind-sqli",
  "ctf-web-xxe-closure",
  "ctf-file-read-via-parser",
  "ctf-whitebox-env-check",
  "ctf-whitebox-handoff",
])

const FORENSICS_HEAVY_EXACT = new Set([
  "ctf-artifact-page",
  "ctf-media-open",
  "ctf-pcap-carve",
  "ctf-pcap-extract",
  "ctf-stego-triage",
])

const REV_HEAVY_EXACT = new Set([
  "ctf-rev-live-memory-dump",
  "ctf-rev-unicorn-helper",
  "ctf-rev-unicorn-replay-builder",
  "ctf-windows-gui-inspect",
])

/** REV folder tools that are light enough for ctf-fast but belong to rev pack. */
const REV_EXACT = new Set([
  "ctf-rev-closure-ladder",
  "ctf-rev-runtime-session",
  "ctf-rev-runtime-doctor",
  "ctf-pe-unpack",
  "ctf-pe-hybrid-rebuild",
  "ctf-runtime-dump",
  "ctf-windows-expect-runner",
  "ctf-windows-debug-helper",
])

const JAVA_EXACT = new Set([
  "ctf-java-analyze-pack",
  "ctf-java-archive-map",
  "ctf-java-bytecode-hints",
  "ctf-java-chain-planner",
  "ctf-java-config-map",
  "ctf-java-decompile-targets",
  "ctf-java-dep-risk",
  "ctf-java-jdk-env",
  "ctf-java-map",
  "ctf-java-source-slice",
])

const ANDROID_DYNAMIC_EXACT = new Set(["ctf-android-dynamic-macro"])

const PREFIX_RULES: Array<{ prefix: string; pack: ToolPackId }> = [
  { prefix: "ctf-web-observe", pack: "core" },
  { prefix: "ctf-android-", pack: "android" },
  { prefix: "ctf-apk-", pack: "android" },
  { prefix: "ctf-dex-", pack: "android" },
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
  { prefix: "ctf-crypto-", pack: "crypto" },
  { prefix: "ctf-rsa-", pack: "crypto" },
  { prefix: "ctf-ecdsa-", pack: "crypto" },
  { prefix: "ctf-prng-", pack: "crypto" },
  { prefix: "ctf-forensics-", pack: "forensics" },
  { prefix: "ctf-pcap-", pack: "forensics" },
  { prefix: "ctf-aisec-", pack: "aisec" },
  { prefix: "ctf-multimodal", pack: "misc" },
  { prefix: "ctf-misc-", pack: "misc" },
  { prefix: "ctf-dns-", pack: "misc" },
  { prefix: "ctf-qr-", pack: "misc" },
  { prefix: "ctf-encoding-", pack: "misc" },
  { prefix: "ctf-web-observe", pack: "core" },
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
  if (MAINTENANCE_EXACT.has(toolName)) return "maintenance"
  if (PWN_HEAVY_EXACT.has(toolName)) return "pwn-heavy"
  if (WEB_HEAVY_EXACT.has(toolName)) return "web-heavy"
  if (REV_EXACT.has(toolName)) return "rev"
  if (REV_HEAVY_EXACT.has(toolName)) return "rev-heavy"
  if (JAVA_EXACT.has(toolName)) return "java"
  if (ANDROID_DYNAMIC_EXACT.has(toolName)) return "android-dynamic"
  if (FORENSICS_HEAVY_EXACT.has(toolName)) return "forensics-heavy"
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

export function normalizeToolPackName(value: string): ToolPackId | undefined {
  const token = value.trim().toLowerCase()
  if (isToolPackId(token)) return token
  return TOOL_PACK_ALIASES[token]
}

/**
 * Resolve the pack set from user config / env.
 * - missing 闂?DEFAULT_TOOL_PACKS
 * - includes "all" 闂?every pack
 * - otherwise 闂?union with "core" always forced on
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
    const normalized = normalizeToolPackName(token)
    if (normalized) enabled.add(normalized)
  }
  return enabled
}

export function toolAllowedByPacks(toolName: string, enabled: Set<ToolPackId>): boolean {
  return enabled.has(packForTool(toolName))
}

/** Summarize pack membership for diagnostics. */
export function summarizePacks(toolNames: string[]): Record<ToolPackId, string[]> {
  const out = Object.fromEntries(ALL_TOOL_PACKS.map((p) => [p, [] as string[]])) as Record<ToolPackId, string[]>
  for (const name of toolNames) {
    out[packForTool(name)].push(name)
  }
  for (const pack of ALL_TOOL_PACKS) out[pack].sort()
  return out
}
