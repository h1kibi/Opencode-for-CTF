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
> **Scope note:** external binaries such as `ghidra`, `apktool`, and
> `frida` are route-specific soft dependencies, not Expert Mode hard dependencies.
> Missing them should only block the route that needs them.

Challenge info:
$ARGUMENTS

## Mandatory workflow

0. Recognize the startup environment before route work: identify OS / shell / substrate first. If the host is Kali, remember its built-in tool environment is likely available. If the host is Windows / PowerShell, keep command syntax PowerShell-safe and prefer script-first handling for complex requests.
1. Load skill `ctf-expert`.
2. `ctf-evidence-board command=init category=<direction> challengeName=<name-if-known> target=<target> ...` → creates `work/ctf-evidence/<direction-name|direction-MMDDHHmmss>/Evidence.md` plus structured state files. Folder names must be `web-hello` style when the title is known, otherwise `pwn-0719131706` style.
3. **① Recon** — concurrent workers (team dispatch); collect with `add-fact` / `add-clue`.
4. **② Analysis** — before `set-routes`, run the mandatory order: evidence/machine-state cross-check → one `ctf_rag` query built from 2–4 concrete technical anchors of the current case (cite `source` + `chunk_id`; a no-hit result is valid but must still be recorded in the evidence decision log, and the step must never be skipped). Then set **exactly 3** routes (`untested`).
5. **③ Verify** — independent routes concurrent (≤3); dependent chains serial.
   - Update states: `set-route-state routeId=R1 routeState=blocked|dead|live`
   - **blocked ≠ dead** (WAF/obstacles may mean correct path)
6. **④ Success** — return flag **directly** and stop active exploitation (no mandatory flag file). Mention that the user may manually invoke `researcher` with the evidence-case path; do not dispatch or await researcher.
7. **⑤ Failure** — re-read all evidence, run the same mandatory Phase ② `ctf_rag` recall, then `next-round` / new exactly-three route set as justified.

## Dynamic MCP

- On Windows PowerShell, prefer `curl.exe` when literal curl semantics matter; escape `&`, quotes, and `$()` deliberately; for complex HTTP requests, prefer a small script over dense one-line escaping.
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
| Team runtime | `ctf-team-dispatch`, `ctf-team-status`, `ctf-team-collect`, `ctf-team-cancel`, `ctf-team-cancel-route`, `ctf-team-close`, `ctf-team-recover`, `ctf-team-adopt`, `ctf-team-repair` |
| Fact / Intent ledger | `ctf-team-facts` (list-pending/accept/reject/supersede), `ctf-team-intent` (create/list/claim-next/release/supersede) |
| Worker self-claim | `ctf-team-claim` (worker-only; the expert never uses it) |
| Core workflow | `ctf-evidence-board`, `ctf-mcp-control`, `ctf-decompose-task` |

Support tools are helpful but non-blocking outside Phase ②: `ctf-team-mode`, `ctf-tool-packs`.
Phase ② local recall requires `ctf_rag` (hosts that namespace MCP tools expose `ctf_rag_ctf_rag`; both are allowed). It is a mandatory step: a no-hit result is valid, but it must still be recorded in the evidence decision log. If `ctf_rag` is unavailable (unset `CTF_RAG_PYTHON` / `CTF_RAG_ROOT` / `CTF_RAG_KB_ROOT` records a non-fatal `missing env` skip), note the skip and continue without local recall.
If a support tool is unavailable, continue the Expert contract directly with the hard-required tools.

If hard-required tools are missing, restart OpenCode after setting `team_mode.enabled=true`
and `tool_packs=["all"]` in `opencode-for-ctf.jsonc`.

## Recovery after restart

If a handoff or Evidence.md already exists (e.g. `work/ctf-evidence/<slug>/`),
resume from it — do not restart from zero. Pass the challenge context and
handoff path to `/ctf-expert` when re-invoking.
