---
description: CTF control: OMO-style CTF stop gate; decide continue, pivot, ask user, final, or retro when progress stalls
agent: ctf-master
subtask: false
---

Run the CTF Stop Gate.

Current state:
$ARGUMENTS

Rules:
- Use after budget exhaustion, two failed top hypotheses, repeated tool failures, state-damage risk, no new differential, or 2-3 probes without legitimate progress.
- Do not run new probes in this command.
- Check whether the current branch has a confirmed primitive, a useful differential, or only noise.
- If a candidate flag exists, prefer FINAL gate over continued exploration.
- Before deciding CONTINUE, check unresolved P0/P1/P2 signal debt and terminal candidates; if debt remains and the next action is another same-family variant, return PIVOT or CONTINUE only with an orthogonal debt-paying probe.
- Respect budget profile pressure explicitly: `safe-remote` should bias toward PIVOT or ASK_USER earlier than `local-only` or `hard`.
- Preferred entrypoint note: use `/ctf-control` when the stop-vs-continue decision is only one of several plausible control actions. Use `/ctf-stop-gate` when the branch is already visibly stalling.

Return exactly one decision with evidence:
1. CONTINUE: one next high-information probe exists within budget.
2. PIVOT: current branch is low information but another hypothesis remains.
3. ASK_USER: missing target/scope/credential/flag-format info blocks progress.
4. FINAL: credible flag candidate or direct reproduction exists.
5. RETRO: solve is exhausted or abandoned; record lessons.

Required fields:
- stopped_by: budget|two_failed_top_hypotheses|tool_failure|state_damage|flat_differential|no_progress|resource_missing
- current_branch_role: terminal|bridge|support|noise|unknown
- unresolved_signal_debt: P0/P1/P2 summary or none
- next_allowed_action: exact command/probe or `none`
- forbidden_next_action: same-family variant, broad fuzzing, new bug family, or none
- evidence_refresh: `none` or the exact state file that must be refreshed before the allowed next action
