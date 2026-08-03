---
name: ctf-web-control-plane
description: Use after primitive-lock to find a stable exfiltration or feedback channel. Evaluates admin sessions, backend endpoints, DB fields, reloadable/imported files, debug/log surfaces, template/static paths, direct echo, and blind callbacks.
compatibility: opencode
---

# CTF Web Control Plane

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return the selected stable channel to `ctf-web-exploit-chain` or `ctf-closure-gate`; pivot only when the boundary is falsified.

## First Safe Action

Summarize the confirmed primitive, boundary, and available channels, then choose the least stateful output path.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after primitive-lock when the next problem is stable feedback, output, or flag access.

## Purpose

When any strong primitive is confirmed, select a stable control plane before final exploitation. The control plane is the channel through which you observe output, exfiltrate data, or receive feedback from the target.

## Priority Order

Prefer control planes in this order:

1. Authenticated admin session or privileged cookie.
2. Existing backend/admin endpoint.
3. Existing database-backed field visible in admin/user pages.
4. Existing file that is imported, loaded, rendered, or served reliably.
5. Existing logs or debug/admin views.
6. Existing template/static route.
7. New route or newly created file only if reload/serving behavior is proven.
8. Blind callback only when no stable challenge-local channel exists.

## Decision Rules

- If admin session is available, use it before blind XSS, blind SSRF, or speculative file writes.
- If code execution or file write is available, choose the output channel first.
- Prefer writing output into an existing rendered database field over creating a new HTTP route.
- Prefer challenge-local observation over external exfiltration.
- Prefer existing reloadable/imported files over core routing/config files.
- Do not overwrite core files until a canary proves write behavior and a final chain is ready.

## For File Write Primitives

When file write is the primitive:

- Distinguish arbitrary create from overwrite-only behavior.
- Prefer files that already exist and are imported/rendered/served naturally.
- Prefer non-core files before route/controller/config files.
- Build a file write matrix before choosing the target file.

## Output Contract

Write this to `notes.md`:

```markdown
# Stable Control Plane

| Candidate | Evidence | Stability | Risk | Use |
|---|---|---:|---:|---|
| admin session | | | | |
| backend endpoint | | | | |
| DB-backed field | | | | |
| reloadable/imported file | | | | |
| log/debug view | | | | |
| direct HTTP echo | | | | |
| blind callback | | | | |

Selected control plane:
-
```
