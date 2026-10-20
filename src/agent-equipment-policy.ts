/**
 * Agent Equipment Policy — single source of truth for tool and MCP authorization.
 *
 * This module consolidates all agent → {tools, MCPs, restrictions} mappings
 * that were previously scattered across tool-packs.ts, agent-mcp-profiles.ts,
 * and family-capability-contracts.ts.
 *
 * Query interface:
 *   - isToolAuthorizedForAgent(tool, agent, context) → boolean
 *   - getMcpDefaultsForAgent(agent) → string[]
 *   - getToolSurfaceForAgent(agent) → Record<string, true>
 *
 * All authorization decisions flow through this module.
 */

import type { ToolPackId } from "./tool-packs.ts"
import { packForTool } from "./tool-packs.ts"

// ============================================================================
// Core Equipment Data
// ============================================================================

/** Common baseline MCP IDs that most CTF agents receive. */
export const COMMON_LIGHT_MCPS = ["filesystem", "context7", "github", "markitdown"] as const

/** Tools shared by every subagent (triage, env, analysis, knowledge). */
const SUBAGENT_CORE_TOOLS: Record<string, true> = {
  "ctf-route-plan": true,
  "ctf-file-triage": true,
  "ctf-one-shot-triage": true,
  "ctf-binary-probe": true,
  "ctf-flag-grep": true,
  "ctf-flag-verify": true,
  "ctf-evidence-board": true,
  "ctf-decision-state": true,
  "ctf-artifact-analyze": true,
  "archive-safe-extract": true,
  "ctf-safe-extract": true,
  "doc-read": true,
  "image-file-info": true,
  "ctf-python-inline": true,
  "ctf-ensure-dir": true,
  "ctf-env-check": true,
  "ctf-tool-packs": true,
  "ctf-dynamic-mcp-advisor": true,
  "ctf-mcp-control": true,
  "ctf-encoding-chain": true,
  "ctf-multimodal-triage": true,
  "ctf-proto-probe": true,
  "ctf-java-analyze": true,
}

// ============================================================================
// Fast Primary Agent Equipment
// ============================================================================

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
  // env check — all agents should verify environment readiness
  "ctf-env-check",
  // artifact analysis — all agents should analyze challenge files
  "ctf-artifact-analyze",
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

/** Read-only MCP retrieval the fast lane may call directly. */
export const FAST_MCP_SERVER_PREFIXES = ["ctf_rag_"] as const
export const FAST_MCP_TOOL_NAMES = new Set(["ctf_rag"])

/** Agents that use the fast tool surface (exact names). */
const FAST_TOOL_AGENT_NAMES = new Set(["ctf-fast"])

// ============================================================================
// Category Subagent Lightweight Tools
// ============================================================================

/** ctf-web lightweight: triage, fingerprint, source analysis. No fuzz/attack. */
const WEB_LIGHT: Record<string, true> = {
  "ctf-web-analyze": true,
  "ctf-web-fingerprint": true,
  "ctf-web-blackbox-map": true,
  "ctf-web-probe": true,
  "ctf-web-source-map": true,
  "ctf-api-map": true,
  "ctf-proto-probe": true,
  "ctf-java-analyze": true,
  "archive-safe-extract": true,
}

/** ctf-pwn lightweight: probe, check-env, disasm analysis. No docker/exploit. */
const PWN_LIGHT: Record<string, true> = {
  "ctf-pwn-analyze": true,
  "ctf-pwn-runner": true,
  "ctf-pwn-check-env": true,
  "ctf-pwn-fast-skeleton-hints": true,
  "ctf-pwn-offset": true,
  "ctf-pwn-remote-fingerprint": true,
  "ctf-pwn-probe": true,
  "ctf-pwn-libc-hint": true,
  "ctf-elf-slice": true,
  "ctf-proto-probe": true,
}

/** ctf-rev lightweight: static analysis, no dynamic / android heavy. */
const REV_LIGHT: Record<string, true> = {
  "ctf-rev-analyze": true,
  "ctf-rev-capability-check": true,
  "ctf-rev-closure-ladder": true,
  "ctf-binary-probe": true,
  "ctf-elf-slice": true,
  "ctf-go-pclntool": true,
  "ctf-rev-pe-slice": true,
  "ctf-pcap-probe": true,
}

/** ctf-crypto lightweight: rsa probe, analysis, no heavy computation. */
const CRYPTO_LIGHT: Record<string, true> = {
  "ctf-crypto-analyze": true,
  "ctf-rsa-probe": true,
  "ctf-python-inline": true,
  "ctf-proto-probe": true,
}

/** ctf-forensics lightweight: pcap/stego triage, media, no heavy extraction. */
const FORENSICS_LIGHT: Record<string, true> = {
  "ctf-forensics-analyze": true,
  "ctf-pcap-probe": true,
  "ctf-stego-probe": true,
  "ctf-image-open": true,
  "ctf-go-pclntool": true,
  "ctf-artifact-analyze": true,
}

/** ctf-aisec lightweight: AI wrapper/model triage, controlled probing, and local harnesses. */
const AISEC_LIGHT: Record<string, true> = {
  "ctf-aisec-env-check": true,
  "ctf-aisec-model-inspect": true,
  "ctf-aisec-inference-probe": true,
  "ctf-misc-analyze": true,
  "ctf-python-inline": true,
  "ctf-web-source-map": true,
}

/** ctf-misc lightweight: protocol probes, scripting, general triage. */
const MISC_LIGHT: Record<string, true> = {
  "ctf-misc-analyze": true,
  "ctf-misc-env-check": true,
  "ctf-proto-probe": true,
  "ctf-encoding-chain": true,
  "ctf-multimodal-triage": true,
  "ctf-python-inline": true,
  "ctf-ensure-dir": true,
  "ctf-artifact-analyze": true,
  "ctf-pcap-probe": true,
  "ctf-stego-probe": true,
  "ctf-image-open": true,
  "ctf-rsa-probe": true,
  "ctf-binary-probe": true,
  "ctf-dns-probe": true,
  "ctf-qr-probe": true,
  "ctf-elf-slice": true,
  "ctf-go-pclntool": true,
  "ctf-rev-pe-slice": true,
  "ctf-web-source-map": true,
}

/** ctf-scout lightweight: broad first-pass facades and focused probes only. */
const SCOUT_LIGHT: Record<string, true> = {
  "ctf-api-map": true,
  "ctf-web-analyze": true,
  "ctf-web-blackbox-map": true,
  "ctf-web-fingerprint": true,
  "ctf-web-source-map": true,
  "ctf-pwn-analyze": true,
  "ctf-rev-analyze": true,
  "ctf-rev-capability-check": true,
  "ctf-crypto-analyze": true,
  "ctf-forensics-analyze": true,
  "ctf-misc-analyze": true,
  "ctf-encoding-chain": true,
  "ctf-multimodal-triage": true,
  "ctf-binary-probe": true,
  "ctf-rsa-probe": true,
  "ctf-pcap-probe": true,
  "ctf-stego-probe": true,
}

/** Subagent name → lightweight tool set (category tools ∪ core tools). */
export const SUBAGENT_LIGHT_TOOLS: Record<string, Set<string>> = {
  "ctf-web": new Set([...Object.keys(WEB_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-pwn": new Set([...Object.keys(PWN_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-rev": new Set([...Object.keys(REV_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-crypto": new Set([...Object.keys(CRYPTO_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-forensics": new Set([...Object.keys(FORENSICS_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-misc": new Set([...Object.keys(MISC_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-aisec": new Set([...Object.keys(AISEC_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-scout": new Set([...Object.keys(SCOUT_LIGHT), ...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-oracle": new Set([...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-librarian": new Set([...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-verifier": new Set([...Object.keys(SUBAGENT_CORE_TOOLS)]),
  "ctf-retro": new Set([...Object.keys(SUBAGENT_CORE_TOOLS)]),
}

// ============================================================================
// MCP Default Profiles
// ============================================================================

/**
 * Per-agent default MCP candidate sets.
 *
 * Heavy entries in these lists are family-scoped requestable capabilities.
 * Runtime default activation filters them out with "heavy, must request".
 * Keys are the agent names as they appear in the agent manifest.
 */
export const AGENT_MCP_DEFAULTS: Record<string, string[]> = {
  // === Primary agents ===
  /**
   * Fast is the single lightweight execution Agent; family is selected by route packs.
   * `ctf_rag` is the read-only local corpus index, so it is a default here
   * rather than a request/approve backend.
   */
  "ctf-fast": [...COMMON_LIGHT_MCPS, "ctf_rag"],
  /** Expert owns evidence-driven orchestration and the default browser capability. */
  "ctf-expert": [...COMMON_LIGHT_MCPS, "browser"],

  // === Category subagents ===
  /** Web exploitation - browser can start by default; DB/SSH MCPs are requestable. */
  "ctf-web": [...COMMON_LIGHT_MCPS, "browser", "mysql-mcp", "ssh-mcp"],

  /** Binary exploitation - debugger/SSH MCPs are requestable but not auto-started. */
  "ctf-pwn": [...COMMON_LIGHT_MCPS, "gdb-mcp", "ssh-mcp"],

  /** Reverse engineering - ReVa starts when configured; heavyweight GUI/debugger MCPs are requestable. */
  "ctf-rev": [...COMMON_LIGHT_MCPS, "ReVa", "gdb-mcp", "x64dbg-mcp", "ssh-mcp"],

  /** Cryptography — default CyberChef supports structured transform chains. */
  "ctf-crypto": [...COMMON_LIGHT_MCPS, "cyberchef-mcp"],

  /** Forensics - WireMCP/CyberChef can start when configured; DB/SSH MCPs are requestable. */
  "ctf-forensics": [...COMMON_LIGHT_MCPS, "wireshark-mcp", "cyberchef-mcp", "mysql-mcp", "ssh-mcp"],

  /** Misc/jail/blockchain - open-ended, with requestable DB/SSH heavy MCPs. */
  "ctf-misc": [...COMMON_LIGHT_MCPS, "wireshark-mcp", "cyberchef-mcp", "mysql-mcp", "ssh-mcp"],

  /** AI security - browser for wrapper inspection; heavy family tools remain requestable. */
  "ctf-aisec": [...COMMON_LIGHT_MCPS, "browser"],

  // === Support subagents ===
  /** Info gathering scout — needs browser for OSINT. */
  "ctf-scout": [...COMMON_LIGHT_MCPS, "browser"],

  /** Knowledge oracle — retrieves technique context through the local `ctf_rag` index. */
  "ctf-oracle": [...COMMON_LIGHT_MCPS, "ctf_rag"],

  /** Knowledge librarian — retrieval plus the filesystem it reports against. */
  "ctf-librarian": ["filesystem", "ctf_rag"],

  /** Verification gate — minimal tooling. */
  "ctf-verifier": ["filesystem"],

  /** Retro/knowledge collector — search + knowledge retrieval. */
  "ctf-retro": [...COMMON_LIGHT_MCPS, "ctf_rag"],

  /** Researcher — curates the corpus behind ctf_rag retrieval. */
  researcher: [...COMMON_LIGHT_MCPS, "ctf_rag"],
}

/**
 * Heavy packs that a subagent may use tools from when those packs are enabled.
 * E.g., ctf-web can use web-heavy tools; ctf-rev can use rev-heavy, java, android tools.
 */
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

/** All known CTF subagent names that have profiles. */
export const KNOWN_AGENTS = Object.keys(AGENT_MCP_DEFAULTS)

// ============================================================================
// Query Interface
// ============================================================================

/**
 * Whether a tool may run for the given agent after pack filtering.
 * Non-fast agents: all pack-allowed tools. Fast: allowlist only.
 */
export function toolAllowedForAgent(toolName: string, agentName?: string | null): boolean {
  if (!agentName || !FAST_TOOL_AGENT_NAMES.has(agentName)) return true
  if (FAST_TOOL_ALLOWLIST.has(toolName)) return true
  if (FAST_MCP_TOOL_NAMES.has(toolName)) return true
  // MCP namespaced tools: allow ctf_rag_* for fast lane
  if (FAST_MCP_SERVER_PREFIXES.some((prefix) => toolName.startsWith(prefix))) return true
  return false
}

/**
 * Whether a tool is in the subagent's lightweight allowlist.
 * Returns true for non-subagent agents (ctf-fast / ctf-expert / researcher).
 */
export function toolAllowedForSubagent(toolName: string, agentName: string, enabledPacks?: Iterable<string>): boolean {
  if (!isCtfSubagent(agentName)) return true
  const allowlist = SUBAGENT_LIGHT_TOOLS[agentName]
  if (!allowlist) return true

  // The Team runtime injects this generated tool into worker sessions.
  if (toolName === "ctf-team-claim") return true

  if (allowlist.has(toolName)) return true

  // Allow tools from opt-in packs when those packs are enabled
  const enabled = new Set([...(enabledPacks ?? [])])
  const pack = packForTool(toolName)
  return enabled.has(pack) && Boolean(SUBAGENT_OPT_IN_PACKS[agentName]?.has(pack))
}

/**
 * Get the default MCP set for an agent. Returns COMMON_LIGHT_MCPS if unknown.
 */
export function getAgentMcpDefaults(agentName: string): string[] {
  return AGENT_MCP_DEFAULTS[agentName] ?? [...COMMON_LIGHT_MCPS]
}

/**
 * Human-readable list of lightweight tools a subagent can use.
 * Used in error messages to suggest what the subagent SHOULD try.
 */
export function subagentLightToolSample(agentName: string, max = 8): string {
  const allowlist = SUBAGENT_LIGHT_TOOLS[agentName]
  if (!allowlist) return "(unknown subagent)"
  const tools = [...allowlist]
  const sample = tools.slice(0, max)
  return sample.join(", ") + (tools.length > max ? ", …" : "")
}

/**
 * Get the complete lightweight tool surface for a subagent.
 * Returns undefined for non-subagent agents.
 */
export function getSubagentToolSurface(agentName: string): Set<string> | undefined {
  return SUBAGENT_LIGHT_TOOLS[agentName]
}

/**
 * Get the fast tool allowlist.
 */
export function getFastToolAllowlist(): Set<string> {
  return new Set(FAST_TOOL_ALLOWLIST)
}

/**
 * Check if an agent is a CTF subagent (category worker).
 */
export function isCtfSubagent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  return Boolean(SUBAGENT_LIGHT_TOOLS[agentName])
}

/**
 * Check if an agent uses the fast tool surface.
 */
export function isFastToolAgent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  return FAST_TOOL_AGENT_NAMES.has(agentName)
}
