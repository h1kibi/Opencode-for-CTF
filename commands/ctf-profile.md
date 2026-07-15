---
description: CTF entry: OMO-style CTF solve profile selector; choose speedrun, hard, safe-web, pwn-local, or forensics-direct behavior
agent: ctf-master
subtask: false
---

Select a CTF solve profile for the current challenge.

Context:
$ARGUMENTS

Profiles:
- `speedrun`: use for fresh/easy-medium scoreboard targets. Prioritize source leaks, default creds, obvious debug/config, weak token shape, direct flag grep, and shortest reproduction. Switch to `hard` after 8-12 minutes without a direct signal.
- `hard`: use for multi-step, source-heavy, stateful, or stalled challenges. Enforce decision-state, top-3 hypotheses, probe validation, fan-out, review, pivot, and final gates.
- `safe-web`: use for Web targets with state-changing flows, uploads, admin bots, file writes, payment/workflow, or shared remote instances. Prefer low-volume probes, canaries, authz matrix, fuzz plan, and state-damage checks.
- `pwn-local`: use for native binaries. Prefer local triage, checksec, strings/imports, crash/control evidence, playbook routing, and deterministic exploit scripts before remote attempts.
- `forensics-direct`: use for pcaps/media/docs/archives. Prefer metadata, strings, archive-safe extraction, flag grep, protocol/media probes, and avoid slow brute force until evidence warrants it.

Return compactly:
1. Selected profile and confidence.
2. Why this profile fits.
3. Mandatory first gates/commands.
4. Forbidden actions for this profile.
5. Exit condition to switch profiles.
