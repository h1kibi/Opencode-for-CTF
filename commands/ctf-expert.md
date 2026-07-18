---
description: "CTF entry: evidence-driven comprehensive solving (primary expert lane)"
agent: ctf-expert
subtask: false
---

# /ctf-expert — evidence-driven Team Mode lane

Force the expert primary agent. For automatic routing, prefer `/ctf`.

> **Preflight:** Expert Mode requires Team Mode tools (`ctf-team-*`) and core workflow
> tools (`ctf-evidence-board`, `ctf-mcp-control`, `ctf-decompose-task`). If these are
> not in the process registry, the command will fail fast with diagnostics and recovery
> steps. This is usually because OpenCode was started before the config was applied.
> Fix: restart OpenCode after enabling `team_mode.enabled=true` and appropriate tool
> packs. Do **not** use ordinary task/delegate concurrency as a substitute.
>
> **Scope note:** external binaries such as `ida`, `jadx`, `ghidra`, `apktool`, and
> `frida` are route-specific soft dependencies, not Expert Mode hard dependencies.
> Missing them should only block the route that needs them.

Challenge info:
$ARGUMENTS

## Mandatory workflow

1. Load skill `ctf-expert`.
2. `ctf-evidence-board command=init ...` → creates **Evidence.md**.
3. **① Recon** — concurrent workers (team dispatch); collect with `add-fact` / `add-clue`.
4. **② Analysis** — `set-routes` with **exactly 3** routes (`untested`).
5. **③ Verify** — independent routes concurrent (≤3); dependent chains serial.
   - Update states: `set-route-state routeId=R1 routeState=blocked|dead|live`
   - **blocked ≠ dead** (WAF/obstacles may mean correct path)
6. **④ Success** — return flag **directly** and stop (no mandatory flag file).
7. **⑤ Failure** — `next-round` → new 3 routes from accumulated evidence → back to ②.

## Dynamic MCP

- Subagents: `ctf-dynamic-mcp-advisor action=request`
- You: `ctf-mcp-control action=list-pending` then `approve` / `deny`
- Approve only when a current route clearly needs that heavy MCP

## Team Mode

- You own strategy, Evidence.md, and worker lifecycle.
- Workers return evidence only.
- Caps: recon 3–5, verify ≤3, exploit ≤2 concurrent workers.
- Every job needs `routeId` (`recon|R1|R2|R3|general`).
- Independent routes: concurrent; shared_state: serial.
- On live route: `ctf-team-cancel-route keepRouteId=R*`.
- After every collect: `ctf-mcp-control list-pending` then approve/deny before next dispatch.

## Tool requirements

The following hard-required tools must be registered in the process tool registry (fixed at OpenCode startup):

| Category | Tools |
|----------|-------|
| Team runtime | `ctf-team-dispatch`, `ctf-team-status`, `ctf-team-collect`, `ctf-team-cancel`, `ctf-team-cancel-route`, `ctf-team-close`, `ctf-team-recover` |
| Core workflow | `ctf-evidence-board`, `ctf-mcp-control`, `ctf-decompose-task` |

Support tools are helpful but non-blocking: `ctf-team-mode`, `ctf-handoff`, `ctf-tool-packs`.
If a support tool is unavailable, continue the Expert contract directly with the hard-required tools.

If hard-required tools are missing, restart OpenCode after setting `team_mode.enabled=true`
and `tool_packs=["all"]` in `opencode-for-ctf.jsonc`.

## Recovery after restart

If a handoff or Evidence.md already exists (e.g. `work/ctf-evidence/<slug>/`),
resume from it — do not restart from zero. Pass the challenge context and
handoff path to `/ctf-expert` when re-invoking.
