/**
 * Agent MCP Profiles — default MCP server sets per CTF subagent.
 *
 * Design:
 *   light  — common baseline (filesystem, context7, github, markitdown).
 *            Every CTF subagent gets these unconditionally.
 *   medium — domain-specific tools matched to the agent's specialty.
 *            Activated as part of defaults.
 *   heavy  — not in defaults; subagent must request via ctf-expert.
 *
 * Default activation is additive: light + medium for the agent's profile.
 * Heavy servers are never activated by default.
 */

/** Common baseline MCP IDs that every CTF subagent receives. */
export const COMMON_LIGHT_MCPS = ["filesystem", "context7", "github", "markitdown"]

/**
 * Per-agent default MCP sets (light + medium only).
 * Keys are the agent names as they appear in the agent manifest.
 */
export const AGENT_MCP_DEFAULTS: Record<string, string[]> = {
  // === Primary agents ===
  /** Fast is the single lightweight execution Agent; family is selected by route packs. */
  "ctf-fast": [...COMMON_LIGHT_MCPS],
  /** Expert owns evidence-driven orchestration and the default browser capability. */
  "ctf-expert": [...COMMON_LIGHT_MCPS, "browser"],

  // === Category subagents ===
  /** Web exploitation — needs browser for live app inspection. */
  "ctf-web": [...COMMON_LIGHT_MCPS, "browser"],

  /** Binary exploitation — lightweight, no domain-specific MCP needed. */
  "ctf-pwn": [...COMMON_LIGHT_MCPS],

  /** Reverse engineering — Ghidra/ReVa for decompilation. */
  "ctf-rev": [...COMMON_LIGHT_MCPS, "ReVa"],

  /** Cryptography — default CyberChef supports structured transform chains. */
  "ctf-crypto": [...COMMON_LIGHT_MCPS, "cyberchef-mcp"],

  /** Forensics — WireMCP for pcap plus CyberChef for structured transforms. */
  "ctf-forensics": [...COMMON_LIGHT_MCPS, "wireshark-mcp", "cyberchef-mcp"],

  /** Misc/jail/blockchain — open-ended, give Wireshark/CyberChef as medium helpers. */
  "ctf-misc": [...COMMON_LIGHT_MCPS, "wireshark-mcp", "cyberchef-mcp"],

  // === Support subagents ===
  /** Info gathering scout — needs browser for OSINT. */
  "ctf-scout": [...COMMON_LIGHT_MCPS, "browser"],

  /** Knowledge oracle — needs knowledge base MCPs. */
  "ctf-oracle": [...COMMON_LIGHT_MCPS, "seckb"],

  /** Knowledge librarian — needs knowledge base MCPs. */
  "ctf-librarian": ["filesystem", "seckb"],

  /** Verification gate — minimal tooling. */
  "ctf-verifier": ["filesystem"],

  /** Retro/knowledge collector — search + knowledge retrieval. */
  "ctf-retro": [...COMMON_LIGHT_MCPS],
}

/** All known CTF subagent names that have profiles. */
export const KNOWN_AGENTS = Object.keys(AGENT_MCP_DEFAULTS)

/** Get the default MCP set for an agent. Returns COMMON_LIGHT_MCPS if unknown. */
export function getAgentDefaults(agentName: string): string[] {
  return AGENT_MCP_DEFAULTS[agentName] ?? [...COMMON_LIGHT_MCPS]
}
