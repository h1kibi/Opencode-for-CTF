/**
 * Agent MCP Profiles — default MCP server sets per CTF subagent.
 *
 * MOVED: This module's content has been consolidated into agent-equipment-policy.ts
 * for single-source-of-truth authorization. Re-exported here for compatibility.
 */

export {
  COMMON_LIGHT_MCPS,
  AGENT_MCP_DEFAULTS,
  KNOWN_AGENTS,
  getAgentMcpDefaults as getAgentDefaults,
} from "./agent-equipment-policy.ts"
