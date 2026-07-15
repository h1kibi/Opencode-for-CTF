# CTF Command Layers

This file documents the intended layering of `/ctf-*` commands so new commands do not drift into overlapping roles.

## Entry Commands

- `/ctf` - route-only triage
- `/ctf-fast` - ask `ctf-master` to run the fast execution lane
- `/ctf-master` - structured full-control lane
- `/ctf-pwn-fast` - compatibility alias into the fast lane for simple/medium PWN

## Opening / Routing Commands

- `/ctf-hard-open` - hard challenge opening pack
- `/ctf-route` - route or reroute a branch
- `/ctf-lead` - structured lead-agent opening flow

## State / Control Commands

- `/ctf-resume` - recover interrupted state
- `/ctf-snapshot` - compact state refresh
- `/ctf-control` - choose the best next control action
- `/ctf-signal-memory` - preserve high-value signals and terminal candidates
- `/ctf-evidence` - normalize compact evidence for chain/pattern matching

## Closure / Final Commands

- `/ctf-closure` - force primitive-to-flag closure ranking
- `/ctf-close` - push a strong branch through low-noise endgame
- `/ctf-final` - validate candidate flag and reproduction path
- `/ctf-retro-lite` - capture reusable retro/feedback

## Maintenance Rule

Before adding a new `/ctf-*` command, decide whether it belongs to:

1. entry
2. opening / routing
3. state / control
4. closure / final
5. knowledge / maintenance

If a new command cannot be cleanly placed in one layer, prefer improving an existing command instead of creating another overlapping entrypoint.

## Preferred vs Overlapping Helpers

Preferred operator-facing commands:

- `/ctf`
- `/ctf-fast`
- `/ctf-master`
- `/ctf-pwn-fast`
- `/ctf-hard-open`
- `/ctf-resume`
- `/ctf-control`
- `/ctf-snapshot`
- `/ctf-signal-memory`
- `/ctf-closure`
- `/ctf-close`
- `/ctf-final`
- `/ctf-retro-lite`

Overlapping helpers that should stay thin and specialized:

- `/ctf-choose`
- `/ctf-route`
- `/ctf-branch`
- `/ctf-owner`
- `/ctf-budget`
- `/ctf-escalate`
- `/ctf-recover`
- `/ctf-state-update`
- `/ctf-endgame`
- `/ctf-stop-gate`
- `/ctf-clean-solve`

These overlaps are acceptable for now, but they should not grow into broader operator-facing entrypoints. If their scope expands, move that logic back into the preferred commands instead.

## Soft Deprecation Policy

For overlapping commands, use soft deprecation instead of immediate deletion:

- keep the file so existing habits and links do not break
- add a short `Soft-deprecated helper note:` block near the top
- name the preferred replacement command explicitly
- keep the helper thinner than the preferred command
- do not add new broad operator logic to overlapping helpers

If a helper can no longer be described in one sentence as a narrow specialization of a preferred command, it should be merged back or redesigned.
