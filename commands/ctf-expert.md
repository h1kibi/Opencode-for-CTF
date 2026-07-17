---
description: "CTF entry: evidence-driven comprehensive solving (primary expert lane)"
agent: ctf-expert
subtask: false
---

# /ctf-expert — evidence-driven Team Mode lane

Force the expert primary agent. For automatic routing, prefer `/ctf`.

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
