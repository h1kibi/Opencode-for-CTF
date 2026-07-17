---
description: CTF control panel: Choose the single best next control action for a messy or uncertain hard-solve state
agent: ctf-expert
subtask: false
---

Run CTF Control Panel.

Current solve/control state:
$ARGUMENTS

Rules:
- Use when the branch feels messy, the next command is unclear, or multiple control actions seem plausible.
- Do not run new probes in this command.
- This command is a thin control entrypoint. Follow `ctf-expert` as the source of truth for anti-formalism, owner discipline, branch discipline, closure override, and stop/escalation behavior.
- Choose the single best next control action from: SNAPSHOT, LEDGER, OWNER, BRANCH, CLOSE, CONTINUE, STOP_GATE, ASK_USER, STOP, or RETRO.

Return exactly one decision with evidence:
1. Chosen control action.
2. Why it is the best next control action now.
3. What immediate command or probe should follow.
4. Why the other nearby control actions are not worth paying for right now.

Anti-control-bloat rule:
- Prefer `CONTINUE` when the state is already crisp and one obvious high-information or high-closure probe exists.
- Prefer `STOP_GATE` over `CONTINUE` when the state has two failed top hypotheses, 2-3 no-progress probes, budget exhaustion, repeated tool failure, state-damage risk, or unresolved signal debt plus same-family variant pressure.
- Prefer `SNAPSHOT` or `LEDGER` only when they reduce a real stale-state cost; do not pay bookkeeping overhead when one obvious probe already exists.

- Do not recommend `LEDGER`, `SNAPSHOT`, `OWNER`, or `BRANCH` only because the solve feels difficult; recommend them only when they remove a specific ambiguity or stale-state cost.

Lesson-aware control rule:
- If the current state clearly matches a known failure signature, prefer the control action that kills or corrects that failure pattern instead of generic organization.
- If the branch is already in closure-first state, prefer `CONTINUE` or `CLOSE` over extra bookkeeping unless the blocker or owner is unclear.
- If the state matches a strategic anti-pattern, mention the anti-pattern name and why another probe in that family is not worth paying for.
- When a matching lesson exists, prefer its suggested control action unless live evidence clearly contradicts it.
- If the chosen action changes owner, queue shape, or signal debt, name the exact structured file refresh expected before the following probe.
