---
description: "Default CTF entry — auto-route category/mode (BINDING), then solve to flag or confirmed dead end"
agent: ctf-fast
subtask: false
---

# /ctf — Default solve entry

**This is the only command most users need.**

> **Agent note:** Frontmatter `agent: ctf-fast` is the OpenCode default shell only.
> The plugin injects a **BINDING** route. If `primary_session_agent` is `ctf-expert`,
> you **must** immediately call `ctf-handoff lane=expert` and then follow the expert contract.
> Session tool surface is already switched; Team Mode is allowed after handoff.

Challenge info:
$ARGUMENTS

## Pipeline (mandatory — binding)

1. **Authorize** — only authorized CTF / lab / local targets.
2. **Read the injected ROUTE DECISION** (plugin hook). It applied `opencode-for-ctf.jsonc` → `default_mode`.
3. **Hard handoff if needed**
   - `primary_session_agent: ctf-expert` (or mode expert/resume) → call **`ctf-handoff lane=expert`** first, then load skill `ctf-expert`.
   - `primary_session_agent: ctf-fast` → stay on fast allowlist; optional `ctf-handoff lane=fast` to lock surface.
4. **Optional refresh** — `ctf-route-plan` if new signals (`hasEvidenceBranch=true` when evidence branch exists).
5. **Execute the lane**
   - **fast** → lightweight allowlist, intuition-first, no Team Mode / Evidence ceremony.
   - **expert** → Evidence.md, exactly 3 routes, concurrent workers with `routeId`, dynamic MCP approve.
6. **Solve** — flag, exhausted routes, or blocked on user resource.
7. **Escalate** — from fast only: `ESCALATE: ctf-expert` then `ctf-handoff lane=expert`.

## Mode guide

| Route result | Meaning |
| --- | --- |
| `fast` | Intuition-first, minimal tooling, short budget |
| `expert` | Evidence.md, 3-route plan, Team Mode concurrency |
| `resume` | Continue existing evidence branch (expert) |

## Config

`default_mode` in `opencode-for-ctf.jsonc` (`auto` \| `fast` \| `expert`) biases `/ctf` when mode is not forced.

`tool_packs` controls which packs load at OpenCode startup (process registry). Expert uses the full registered set; fast is further filtered by allowlist + session surface.

## Do not

- Do not ignore the BINDING route block or skip `ctf-handoff` when primary is expert.
- Do not re-run broad triage when an evidence branch already answers the question.
- Do not invent flags or attack out-of-scope systems.

## Explicit overrides

- Force fast: `/ctf-fast ...`
- Force expert: `/ctf-expert ...`
- Known category: `/ctf-web|pwn|rev|crypto|forensics|misc ...`
- Help: `/ctf-help`
