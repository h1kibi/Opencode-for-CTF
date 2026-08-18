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

/**
 * Lightweight tools allowed for ctf-fast primary sessions.
 * Expert / specialists keep the full pack-filtered registry; fast must stay small
 * so the model is not distracted by heap mappers, team tools, or rare specialists.
 */
export const FAST_TOOL_ALLOWLIST = new Set([
  // routing / triage
  "ctf-route-plan",
  "ctf-tool-packs",
  "ctf-evidence-board",
  "ctf-flag-verify",
  "ctf-file-triage",
  "ctf-one-shot-triage",
  "ctf-binary-probe",
  "ctf-flag-grep",
  "ctf-safe-extract",
  "doc-read",
  "image-file-info",
  "ctf-multimodal-triage",
  // web light
  "ctf-web-analyze",
  "ctf-web-fingerprint",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  // pwn light
  "ctf-pwn-analyze",
  "ctf-pwn-runner",
  "ctf-pwn-check-env",
  "ctf-pwn-fast-skeleton-hints",
  "ctf-pwn-offset",
  "ctf-pwn-remote-fingerprint",
  "ctf-proto-probe",
  "ctf-pwn-probe",
  "ctf-pwn-libc-hint",
  // crypto / forensics light
  "ctf-crypto-analyze",
  "ctf-rsa-probe",
  "ctf-forensics-analyze",
  "ctf-pcap-probe",
  "ctf-stego-probe",
  "ctf-image-open",
  "ctf-rev-analyze",
  "ctf-rev-capability-check",
  "ctf-rev-closure-ladder",
  "ctf-rev-runtime-session",
  "ctf-rev-runtime-doctor",
  "ctf-misc-analyze",
  "ctf-encoding-chain",
  // scripting helpers
  "ctf-python-inline",
  "ctf-ensure-dir",
  // MCP advisor (request only; expert approves heavy)
  "ctf-dynamic-mcp-advisor",
  // env check 闂?all agents should verify environment readiness
  "ctf-env-check",
  // artifact analysis 闂?all agents should analyze challenge files
  "ctf-artifact-analyze",
  // hard lane switch when /ctf command agent stays ctf-fast
  "ctf-handoff",
  "ctf-java-analyze",
  // REV fast-path Windows tooling requested by user feedback
  "ctf-memstr",
  "ctf-pe-unpack",
  "ctf-pe-hybrid-rebuild",
  "ctf-runtime-dump",
  "ctf-rev-pe-recovery",
  "ctf-windows-expect-runner",
  "ctf-windows-debug-helper",
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

// ---------------------------------------------------------------------------
// Per-subagent lightweight tool allowlists
// ---------------------------------------------------------------------------
// Subagents may use only tools in their lightweight allowlist by default.
// Heavy / attack / exploit tools must be requested through ctf-dynamic-mcp-advisor
// and approved by ctf-expert.

/** Tools shared by every subagent (triage, env, analysis, knowledge). */
const SUBAGENT_CORE_TOOLS = new Set([
  "ctf-route-plan",
  "ctf-file-triage",
  "ctf-one-shot-triage",
  "ctf-binary-probe",
  "ctf-flag-grep",
  "ctf-safe-extract",
  "ctf-python-inline",
  "ctf-ensure-dir",
  "ctf-env-check",
  "ctf-artifact-analyze",
  "ctf-evidence-board",
  "ctf-flag-verify",
  "ctf-decision-state",
  "ctf-handoff",
  "ctf-tool-packs",
  "ctf-dynamic-mcp-advisor",
  "ctf-mcp-control",
  "ctf-pattern-card-search",
  "ctf-pattern-to-hypothesis",
  "doc-read",
  "image-file-info",
  "ctf-java-analyze",
])

/** ctf-web lightweight: triage, fingerprint, source analysis. No fuzz/attack. */
const WEB_LIGHT = new Set([
  "ctf-web-analyze",
  "ctf-web-fingerprint",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  "ctf-web-source-map",
  "ctf-api-map",
  "ctf-proto-probe",
  "ctf-java-analyze",
])

/** ctf-pwn lightweight: probe, check-env, disasm analysis. No docker/exploit. */
const PWN_LIGHT = new Set([
  "ctf-pwn-analyze",
  "ctf-pwn-runner",
  "ctf-pwn-check-env",
  "ctf-pwn-fast-skeleton-hints",
  "ctf-pwn-offset",
  "ctf-pwn-remote-fingerprint",
  "ctf-pwn-probe",
  "ctf-pwn-libc-hint",
  "ctf-elf-slice",
  "ctf-proto-probe",
])

/** ctf-rev lightweight: static analysis, no dynamic / android heavy. */
const REV_LIGHT = new Set([
  "ctf-rev-analyze",
  "ctf-rev-capability-check",
  "ctf-rev-closure-ladder",
  "ctf-rev-runtime-session",
  "ctf-rev-runtime-doctor",
  "ctf-elf-slice",
  "ctf-go-pclntool",
  "ctf-rev-pe-slice",
  "ctf-memstr",
  "ctf-pe-unpack",
  "ctf-pe-hybrid-rebuild",
  "ctf-runtime-dump",
  "ctf-rev-pe-recovery",
  "ctf-windows-expect-runner",
  "ctf-windows-debug-helper",
  "ctf-pcap-probe",
  "ctf-binary-probe",
  "ctf-java-analyze",
])

/** ctf-crypto lightweight: rsa probe, analysis, no heavy computation. */
const CRYPTO_LIGHT = new Set(["ctf-crypto-analyze", "ctf-rsa-probe", "ctf-python-inline", "ctf-proto-probe"])

/** ctf-forensics lightweight: pcap/stego triage, media, no heavy extraction. */
const FORENSICS_LIGHT = new Set([
  "ctf-forensics-analyze",
  "ctf-pcap-probe",
  "ctf-stego-probe",
  "ctf-image-open",
  "ctf-go-pclntool",
  "ctf-artifact-analyze",
])

/** ctf-aisec lightweight: AI wrapper/model triage, controlled probing, and local harnesses. */
const AISEC_LIGHT = new Set([
  "ctf-misc-analyze",
  "ctf-proto-probe",
  "ctf-web-source-map",
  "ctf-python-inline",
  "ctf-aisec-env-check",
  "ctf-aisec-model-inspect",
  "ctf-aisec-inference-probe",
])

/** ctf-misc lightweight: protocol probes, scripting, general triage. */
const MISC_LIGHT = new Set([
  "ctf-misc-analyze",
  "ctf-multimodal-triage",
  "ctf-misc-env-check",
  "ctf-dns-probe",
  "ctf-qr-probe",
  "ctf-encoding-chain",
  "ctf-elf-slice",
  "ctf-go-pclntool",
  "ctf-pcap-probe",
  "ctf-rev-pe-slice",
  "ctf-rsa-probe",
  "ctf-stego-probe",
  "ctf-web-source-map",
  "ctf-proto-probe",
  "ctf-python-inline",
  "ctf-ensure-dir",
])

/** ctf-scout lightweight: broad first-pass facades and focused probes only. */
const SCOUT_LIGHT = new Set([
  "ctf-api-map",
  "ctf-crypto-analyze",
  "ctf-forensics-analyze",
  "ctf-misc-analyze",
  "ctf-pcap-probe",
  "ctf-pwn-analyze",
  "ctf-rev-analyze",
  "ctf-rev-capability-check",
  "ctf-rsa-probe",
  "ctf-stego-probe",
  "ctf-web-analyze",
  "ctf-web-blackbox-map",
  "ctf-web-fingerprint",
  "ctf-web-source-map",
])

/** Subagent name 闂?lightweight tool set (category tools 闂?core tools). */
export const SUBAGENT_LIGHT_TOOLS: Record<string, Set<string>> = {
  "ctf-web": new Set([...WEB_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-pwn": new Set([...PWN_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-rev": new Set([...REV_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-crypto": new Set([...CRYPTO_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-forensics": new Set([...FORENSICS_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-misc": new Set([...MISC_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-aisec": new Set([...AISEC_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-scout": new Set([...SCOUT_LIGHT, ...SUBAGENT_CORE_TOOLS]),
  "ctf-oracle": new Set([...SUBAGENT_CORE_TOOLS]),
  "ctf-librarian": new Set([...SUBAGENT_CORE_TOOLS]),
  "ctf-verifier": new Set([...SUBAGENT_CORE_TOOLS]),
  "ctf-retro": new Set([...SUBAGENT_CORE_TOOLS]),
}

/** Agents that are CTF subagents (not primary / support-primary). */
const SUBAGENT_NAMES = new Set(Object.keys(SUBAGENT_LIGHT_TOOLS))

const SUBAGENT_OPT_IN_PACKS: Record<string, Set<ToolPackId>> = {
  "ctf-web": new Set(["web-heavy", "java"]),
  "ctf-pwn": new Set(["pwn-heavy"]),
  "ctf-rev": new Set(["rev-heavy", "java", "android", "android-dynamic"]),
  "ctf-crypto": new Set([]),
  "ctf-forensics": new Set(["forensics-heavy"]),
  "ctf-misc": new Set([]),
  "ctf-aisec": new Set(["aisec"]),
  "ctf-scout": new Set([]),
  "ctf-oracle": new Set([]),
  "ctf-librarian": new Set(["maintenance"]),
  "ctf-verifier": new Set([]),
  "ctf-retro": new Set(["maintenance"]),
}

export function isCtfSubagent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  return SUBAGENT_NAMES.has(agentName)
}

/**
 * Whether a tool is in the subagent's lightweight allowlist.
 * Returns true for non-subagent agents (ctf-fast / ctf-expert / researcher).
 */
export function toolAllowedForSubagent(toolName: string, agentName: string, enabledPacks?: Iterable<string>): boolean {
  if (!isCtfSubagent(agentName)) return true
  const list = SUBAGENT_LIGHT_TOOLS[agentName]
  if (!list) return true
  if (list.has(toolName)) return true

  const enabled = new Set([...(enabledPacks ?? [])])
  const pack = packForTool(toolName)
  return enabled.has(pack) && Boolean(SUBAGENT_OPT_IN_PACKS[agentName]?.has(pack))
}

/**
 * Human-readable list of lightweight tools a subagent can use.
 * Used in error messages to suggest what the subagent SHOULD try.
 */
export function subagentLightToolSample(agentName: string, max = 8): string {
  const list = SUBAGENT_LIGHT_TOOLS[agentName]
  if (!list) return ""
  return [...list].slice(0, max).join(", ")
}

/** Always-on tools regardless of category. */
const CORE_EXACT = new Set([
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
  "ctf-pattern-card-search",
  "ctf-pattern-to-hypothesis",
  "ctf-python-inline",
  "ctf-route-plan",
  "ctf-team-mode",
  "ctf-tool-packs",
  "ctf-mcp-control",
  "ctf-handoff",
  "ctf-java-analyze",
  "doc-read",
  "image-file-info",
])

const MAINTENANCE_EXACT = new Set([
  "archive-safe-extract",
  "ctf-background-job",
  "ctf-lesson-index-audit",
  "ctf-lesson-modifier-plan",
  "ctf-pattern-curation-report",
  "ctf-pattern-feedback",
  "ctf-continuation-control",
  "ctf-file-write-matrix",
  "ctf-imported-knowledge-search",
  "ctf-lesson-search",
  "ctf-python-parallel",
  "ctf-retro-search",
  "ctf-skill-repo-search",
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
