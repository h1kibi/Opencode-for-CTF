/**
 * Tool pack classification and selection.
 *
 * Packs reduce the OpenCode tool schema surface: only enabled packs are
 * imported/registered at plugin startup. Category packs follow tool name
 * prefixes; rare packs (android/godot) stay opt-in.
 *
 * Agent equipment (tool authorization, MCP defaults) lives in
 * agent-equipment-policy.ts.
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

/** Default packs registered without user config (main CTF categories, not rare specialists). */
export const DEFAULT_TOOL_PACKS: ToolPackId[] = ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "aisec"]

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
  "ctf-python-inline",
  "ctf-route-plan",
  "ctf-tool-packs",
  "ctf-mcp-control",
  "ctf-java-analyze",
  "ctf-memstr",
  "ctf-proto-probe",
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
  { prefix: "ctf-team-", pack: "core" },
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
  { prefix: "ctf-stego-", pack: "forensics" },
  // Underscore MCP namespace injected at runtime (ctf_rag_*, ctf_filesystem_*).
  // Must stay AFTER the ctf- hyphen rules so it never shadows them.
  { prefix: "ctf_", pack: "core" },
  { prefix: "ctf-image-open", pack: "forensics" },
  { prefix: "ctf-media-open", pack: "forensics" },
  { prefix: "ctf-artifact-page", pack: "forensics" },
]

/** Pack membership result; "quarantine" marks tools not registered in any pack. */
export type ToolPackLookup = ToolPackId | "quarantine"

/**
 * Assign a tool basename (no extension) to a pack.
 * Unknown tools are quarantined: dropping a new file into tools/ no longer
 * auto-exposes it to agents — registration is an explicit product decision
 * (roadmap W0 tool-surface stopgap; full registered_tools manifest pending).
 */
export function packForTool(toolName: string): ToolPackLookup {
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
  return "quarantine"
}

export function isToolPackId(value: string): value is ToolPackId {
  return (ALL_TOOL_PACKS as string[]).includes(value)
}

export function normalizeToolPackName(value: string): ToolPackId | undefined {
  const token = value.trim().toLowerCase()
  return isToolPackId(token) ? token : undefined
}

/**
 * Resolve the pack set from user config / env.
 * - missing → DEFAULT_TOOL_PACKS
 * - includes "all" → every pack
 * - otherwise → union with "core" always forced on
 */
export function resolveEnabledPacks(requested?: string[] | null): Set<ToolPackId | "quarantine"> {
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
  // Quarantine is a pseudo-pack with an explicit escape hatch: "all" or an
  // explicit "quarantine" token re-enables otherwise unregistered tools, so
  // default-deny never becomes a silent feature removal for power users.
  const withQuarantine = (packs: ToolPackId[]) => new Set<ToolPackId | "quarantine">([...packs, "quarantine"])
  if (tokens.includes("all") || tokens.includes("*")) return withQuarantine(ALL_TOOL_PACKS)

  const enabled = new Set<ToolPackId | "quarantine">(["core"])
  if (tokens.includes("quarantine")) enabled.add("quarantine")
  for (const token of tokens) {
    const normalized = normalizeToolPackName(token)
    if (normalized) enabled.add(normalized)
  }
  return enabled
}

export function toolAllowedByPacks(toolName: string, enabled: Set<ToolPackId | "quarantine">): boolean {
  return enabled.has(packForTool(toolName))
}

/** Summarize pack membership for diagnostics (quarantined tools listed separately). */
export function summarizePacks(toolNames: string[]): Record<ToolPackId | "quarantine", string[]> {
  const out = Object.fromEntries(ALL_TOOL_PACKS.map((p) => [p, [] as string[]])) as Record<
    ToolPackId | "quarantine",
    string[]
  >
  out.quarantine = []
  for (const name of toolNames) {
    out[packForTool(name)].push(name)
  }
  for (const key of Object.keys(out)) (out as Record<string, string[]>)[key].sort()
  return out
}
