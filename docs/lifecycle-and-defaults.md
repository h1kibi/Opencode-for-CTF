# Lifecycle and Defaults

This project is split into runtime control planes and installation-time defaults. The goal of this document is to keep those boundaries explicit so future changes stay local.

## Related documents

- [Runtime Hooks](./runtime-hooks.md)
- [Team Mode Lifecycle](./team-mode-lifecycle.md)
- [MCP Lifecycle](./mcp-lifecycle.md)

## Runtime hook lifecycle

`src/plugin.ts` is the OpenCode adapter. It wires the hook handlers, loads plugin config, registers tools, and surfaces the runtime summaries. The real policy lives in the hook modules:

- `src/hooks/command-hooks.ts` handles `/ctf`, `/ctf-fast`, and `/ctf-expert` command injection.
- `src/hooks/tool-hooks.ts` handles tool gating, skill MCP activation, hashline edit verification, and read-result tagging.
- `src/hooks/session-hooks.ts` handles session idle/status/error/deleted events and continuation state.
- `src/hooks/permission-hooks.ts` handles safe auto-allow decisions.
- `src/hooks/chat-and-diagnostic-hooks.ts` handles chat parameters and compaction context.

The plugin keeps two runtime surfaces in memory:

- `ctf-fast` for the lightweight lane.
- `ctf-expert` for the evidence-driven lane.

The active surface is remembered per session so the tool gate can stay consistent even when the command frontmatter still says `ctf-fast`.

## Team Mode lifecycle

Team Mode is a run/job system, not just a helper for parallel subagents.

The canonical path is:

1. `ctf-team-dispatch` creates a new run and child sessions.
2. Each job starts in `queued`, then moves through `starting`, `running`, and one of the terminal states.
3. `session.status`, `session.idle`, `session.error`, and `session.deleted` reconcile worker state.
4. `ctf-team-collect` gathers bounded output for synthesis.
5. `ctf-team-close` records the final wave outcome.
6. `ctf-team-cancel` and `ctf-team-cancel-route` terminate active workers when the route changes or the wave must stop.
7. `ctf-team-recover` rebuilds the parent view after restart or interruption.
8. `ctf-team-adopt` is an explicit fail-closed takeover for a run whose old parent session is gone and whose workers are fully terminal.

The runtime keeps the worker contract strict:

- workers should not mutate the canonical board/state files
- route IDs must be bound explicitly
- heavy MCP requests should route through `ctf-dynamic-mcp-advisor`

## MCP lifecycle

Dynamic MCP management is split into three ideas:

- default activation for agent sessions
- request/approve flow for heavier or cross-category access
- release on session end

The current runtime manager lives behind `src/dynamic-mcp-manager.ts`, with the implementation details in `src/mcp/mcp-runtime-adapter.ts`.

Behavior to preserve:

- light and medium MCPs may activate automatically when prerequisites are satisfied
- heavy MCPs stay request-based
- same-category requests can be auto-approved when they are not heavy
- approvals are session-scoped and cleaned up on release

## Installer defaults

The installer is a separate policy layer. It does not just copy files; it also writes the minimum OpenCode config needed for the managed runtime.

Installer defaults currently live in `scripts/lib/install-defaults.mjs` and are consumed by `scripts/lib/opencode-ctf-install.mjs`.

### What the installer owns

- safe bash permission defaults
- profile-to-MCP selection
- default plugin bundle location
- managed instruction injection
- config mutation / revert behavior

### What the runtime owns

- session routing
- tool gating
- surface transitions
- MCP activation/release behavior
- Team Mode execution and recovery

### What should remain documentation-only

- recommended external MCPs
- suggested profiles for different users
- operational tips for host restarts and isolated config dirs

## Practical rule

If a change affects how OpenCode is installed or upgraded, put it in the installer layer.
If a change affects how a live session behaves, put it in runtime hooks or the runtime manager.
If it affects both, split the policy from the execution path and document the boundary here.
