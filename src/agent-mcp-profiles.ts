/**
 * Agent MCP Profiles — default MCP server sets per CTF subagent.
 *
 * Design:
 *   light  — common baseline (filesystem, context7, github, markitdown).
 *            Every CTF subagent gets these unconditionally.
 *   medium — domain-specific tools matched to the agent's specialty.
 *            Activated as part of defaults.
 *   heavy  — may be listed as a default candidate for the owning family,
 *            but activateAgentDefaults skips it until it is explicitly requested.
 *
 * Default activation is additive: light + medium for the agent's profile.
 * Heavy servers are never activated by default.
 */

/** Common baseline MCP IDs that every CTF subagent receives. */
export const COMMON_LIGHT_MCPS = ["filesystem", "context7", "github", "markitdown"]

/**
 * Per-agent default MCP candidate sets.
 *
 * Heavy entries in these lists are family-scoped requestable capabilities.
 * Runtime default activation filters them out with "heavy, must request".
 * Keys are the agent names as they appear in the agent manifest.
 */
export const AGENT_MCP_DEFAULTS: Record<string, string[]> = {
  // === Primary agents ===
  /** Fast is the single lightweight execution Agent; family is selected by route packs. */
  "ctf-fast": [...COMMON_LIGHT_MCPS],
  /** Expert owns evidence-driven orchestration and the default browser capability. */
  "ctf-expert": [...COMMON_LIGHT_MCPS, "browser"],

  // === Category subagents ===
  /** Web exploitation - browser can start by default; Java/DB/SSH MCPs are requestable. */
  "ctf-web": [...COMMON_LIGHT_MCPS, "browser", "jadx-mcp", "mysql-mcp", "ssh-mcp"],

  /** Binary exploitation - debugger/IDA/SSH MCPs are requestable but not auto-started. */
  "ctf-pwn": [...COMMON_LIGHT_MCPS, "gdb-mcp", "ida-pro", "ssh-mcp"],

  /** Reverse engineering - ReVa starts when configured; heavyweight GUI/debugger MCPs are requestable. */
  "ctf-rev": [...COMMON_LIGHT_MCPS, "ReVa", "ida-pro", "jadx-mcp", "gdb-mcp", "x64dbg-mcp", "ssh-mcp"],

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
