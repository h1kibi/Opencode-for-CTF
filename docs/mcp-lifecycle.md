# MCP Lifecycle

This document describes the MCP runtime control flow for CTF sessions.

## Layers

### Registry layer

`src/mcp-server-registry.ts`

Defines server facts:

- server id
- weight
- categories
- runtime config
- environment prerequisites

### Profile layer

`src/agent-mcp-profiles.ts`

Defines which MCPs each agent gets by default.

### Runtime layer

`src/mcp/mcp-runtime-adapter.ts`

Implements:

- runtime config expansion
- default activation
- request/approve flow
- in-memory approval cache
- release on session end

### Public façade

`src/dynamic-mcp-manager.ts`

Re-exports the MCP runtime API for the rest of the plugin.

## Lifecycle

### 1. Default activation

When a session reaches the appropriate hook path, the runtime may activate default MCPs for the agent.

Rules:

- light and medium MCPs can activate automatically
- heavy MCPs should not auto-activate by default
- missing environment prerequisites become skips, not crashes

### 2. Request flow

Subagents can request additional MCP access.

Typical request states:

- `pending`
- `activating`
- `approved`
- `active`
- `activation_failed`
- `denied`
- `released`
- `expired`

### 3. Auto-approval path

Same-category, non-heavy requests can be auto-approved when:

- the server exists in the registry
- env prerequisites are satisfied
- activation succeeds

Otherwise the request remains pending for expert review.

### 4. Expert approval path

The expert surface can explicitly approve or deny requests.

Approval should:

- activate the MCP
- record active session ownership
- preserve a clear request status trail

### 5. Release path

When the session ends or the runtime explicitly releases resources:

- skill MCP leases are released
- active profile ownership is removed
- approval cache entries for that session are cleared
- request state becomes `released` when appropriate

## Maintenance rule

If a change affects MCP policy, prefer splitting policy logic from activation logic. The façade should stay stable while the adapter remains the execution layer.
