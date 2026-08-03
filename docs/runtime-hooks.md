# Runtime Hooks

This document describes the runtime hook layout after the hook-handler refactor.

## Entry point

`src/plugin.ts` is now an assembly layer. It is responsible for:

- loading plugin config
- resolving enabled packs
- building the process tool registry
- computing runtime readiness summaries
- wiring OpenCode hooks to handler modules

It should stay thin. If a new feature needs significant logic, it belongs in a hook module or a dedicated subsystem.

## Hook modules

### `src/hooks/command-hooks.ts`

Handles command-time contract injection for:

- `/ctf`
- `/ctf-fast`
- `/ctf-expert`

Responsibilities:

- route injection
- expert preflight gate
- fast/expert surface promotion
- fast-budget handoff text injection

### `src/hooks/tool-hooks.ts`

Handles tool-level behavior:

- fast surface gate
- ctf-expert Team Mode entry-policy gate
- worker shared-state/write policy gate
- subagent lightweight tool gate
- skill-triggered MCP lease activation
- hashline edit verification
- post-read hashline tagging
- grep/glob metadata enrichment

> **hashline cost note:** `tool.execute.after` rewrites every read result by
> splitting, per-line hashing, and rejoining the output (O(n) per read). This
> is the only non-constant hot path in the hook layer; keep the per-line hash
> cheap and avoid adding further per-tool output rewrites here.

#### Expert policy gate

`src/expert-policy.ts` is the Runtime enforcement layer for the ctf-expert
Team Mode entry protocol. It derives state from the canonical persisted
Evidence board and `.ctf-team.json`; it does not maintain a competing in-memory
state machine.

Before the first Team wave, ctf-expert may use bootstrap, evidence, recall, and
Team-control tools, but active investigation tools such as `bash`, category CTF
tools, and ordinary `task`/`delegate` calls are denied. `ctf-team-dispatch` also
requires an initialized Evidence board with exactly three active routes, and
its jobs must bind to those routes (or the global `recon`/`general` routes).

This gate controls tool actions, not the model's natural-language reasoning.
That is intentional: prompts describe the workflow, while the hook is the
fail-closed boundary for operations that can bypass Team Mode. While a Team
wave is dispatching, running, ready for synthesis, degraded, or cancelling,
direct investigation tools are blocked until the Expert uses the Team control
surface to inspect, recover, collect, cancel, or close the wave.

`src/worker-policy.ts` identifies workers from the persisted `.ctf-team.json`
job/session mapping. Workers cannot call supervisor tools (including handoff,
Team Mode status/collect/recover/cancel/close controls, and MCP advisor),
Evidence/state mutation tools, or shell commands
targeting `Evidence.md`, `.ctf-team.json`,
`.ctf-state.json`, `agent_flag.txt`, `work/ctf-evidence`, or `runtime/state`.
Read-only and temporary challenge analysis commands remain available. If .ctf-team.json is corrupt or unreadable,
identified CTF subagents fail closed for these high-privilege operations until the state is repaired.

Session surfaces are persisted in `runtime/state/session-surfaces.json` and
restored during plugin startup. This keeps a `/ctf` session routed to Expert
after a plugin reload instead of silently falling back to `ctf-fast`.

Team state is persisted in `.ctf-team.json`; startup recovery reconciles live
worker sessions, retries known `cancel_failed` aborts, replays pending parent
notifications, and cleans up any `retryPending` replacement reservation left by
a runtime crash. Running workers also carry a per-attempt deadline and
heartbeat metadata. A deadline breach first atomically claims the job, marks it
`retrying`/`retryPending`, and aborts the old worker. While the bounded retry
budget remains, the runtime creates a fenced replacement session, persists its
`retrySessionID` before MCP activation or prompting, reactivates the worker's
default MCP profile, and starts the same assignment from persisted Evidence.
The claim prevents same-state concurrent reconciles from creating duplicate
replacements; startup recovery aborts a persisted pending replacement and fails
closed. Cancellation also records replacement targets before clearing the retry
reservation, then follows promoted/pending session changes for a bounded number
of abort passes; an abort error or non-converging session chain becomes
`cancel_failed` instead of being reported as a clean cancellation. If replacement
startup or cleanup fails, the runtime fails closed as `failed` or `cancel_failed`;
it never treats a stale worker as the active owner. Cross-process/multi-instance
fencing is not yet a production guarantee.

### `src/hooks/session-hooks.ts`

Handles session lifecycle events:

- continuation state updates
- fast-budget escalation
- pending MCP request processing
- Team Mode event bridging
- session-deleted cleanup for MCP/session surface state

### `src/hooks/permission-hooks.ts`

Handles safe auto-allow behavior for routine CTF-safe tool calls and read-only shell patterns.

### `src/hooks/chat-and-diagnostic-hooks.ts`

Handles:

- chat param adjustments for CTF sessions (safety net below the per-agent
  frontmatter `temperature`; keep both layers in sync)
- compaction preservation hints

## Design rules

1. Hook modules should consume subsystem APIs, not re-implement subsystem logic.
2. `plugin.ts` should not grow new policy branches unless they are trivial glue.
3. Session-level state transitions must stay centralized in hook handlers and their backing subsystem APIs.
4. Diagnostics should prefer `src/capabilities/` summaries over ad hoc string assembly when possible.
