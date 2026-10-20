/**
 * Compatibility façade for MCP runtime lifecycle helpers.
 *
 * The canonical MCP implementation now lives in `src/mcp/mcp-runtime-adapter.ts`.
 * This file intentionally remains thin so existing imports keep working while
 * runtime policy and activation details evolve behind the façade.
 */

export {
  activateAgentDefaults,
  agentNameToCategory,
  approveRequest,
  clearMcpActivationIssues,
  denyRequest,
  getAgentMcpState,
  isInMemoryApproved,
  listAllRequests,
  listRecentActivationIssues,
  listPendingRequests,
  metaToRuntimeConfig,
  processPendingRequests,
  pruneInMemoryApproved,
  recordMcpActivationIssue,
  releaseSessionMcps,
  requestMcp,
} from "./mcp/mcp-runtime-adapter.ts"
