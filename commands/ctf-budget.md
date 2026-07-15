---
description: CTF control: OMO-style CTF budget manager; set probe, fuzz, OOB, write, and time budgets before continuing
agent: ctf-master
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-hard-open`, `/ctf-master`, or `/ctf-stop-gate` when budget is only one part of a broader control decision.
- Keep `/ctf-budget` for explicit budget review or adjustment.

Set or review CTF solve budget.

Context:
$ARGUMENTS

Rules:
- Use when the challenge is remote, stateful, time-limited, or drifting.
- Track budgets for time, same-family probes, fuzz volume, OOB probes, state-changing requests, file writes, remote exploit attempts, and subagent fan-out.
- Assign explicit stop conditions before continuing.
- Prefer lower budgets for shared remote targets and unknown state damage.
- If budget is exhausted, return STOP_GATE_REQUIRED.
- Default hard budget unless overridden: two same-family no-differential probes, one low-volume fuzz plan before any fuzzer, one harmless bot/admin trigger canary before exploit payloads, one upload/write canary before destructive-looking writes, one OOB confirmation canary before exfil, and a checkpoint after roughly 25% of the expected solve time.
- Preferred entrypoint note: `/ctf-budget` is a support command. Use it when budget itself is the question; otherwise let `/ctf-hard-open`, `/ctf-master`, or `/ctf-stop-gate` carry the default budget model.
- Profile intent:
  - `speedrun`: fastest safe closure bias, minimal bookkeeping, low branch fanout.
  - `medium`: balanced branch exploration with modest same-family budget.
  - `hard`: full rigorous queue, fanout, and closure tracking.
  - `safe-remote`: conservative remote posture; stop earlier on flat differentials or risky state changes.
  - `local-only`: broadest runtime latitude because all effects stay local.

Return compactly:
1. Selected budget profile: speedrun / medium / hard / safe-remote / local-only.
2. Remaining budgets by category.
3. Next checkpoint condition.
4. Actions forbidden until budget changes.
5. CONTINUE / PIVOT / STOP_GATE_REQUIRED / ASK_USER.
6. Stuck-gate trigger and the exact command/probe to run when it fires.
7. Evidence update expectation: whether `route.json`, `hypotheses.json`, or `signal-memory.yaml` should be refreshed before the next risky action.
