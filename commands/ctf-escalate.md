---
description: CTF escalate: Decide whether to continue, switch modes, enter closure, stop, or ask for missing inputs
agent: ctf-expert
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-control` as the default operator-facing control helper.
- Keep `/ctf-escalate` for explicit mode / closure / owner escalation decisions.

Run CTF Escalate.

Current progress state:
$ARGUMENTS

Rules:
- Use when the next control decision is unclear: keep going, switch from fast to rigorous thinking, enter closure, refresh ledger, stop, retro, or ask the user.
- Do not run new probes in this command.
- Base the decision on current evidence quality, oracle quality, branch stability, closure probability, missing inputs, and state-damage risk.
- If a plausible primitive-to-flag path exists, prefer CLOSURE over broader exploration.
- If the state is stale or branching is noisy, prefer LEDGER before more probing.
- If owner/category confusion is the main blocker, prefer OWNER.
- If scope, credentials, target details, or flag format are missing, prefer ASK_USER.
- If the branch is exhausted and no better hypothesis remains, prefer RETRO or STOP rather than inventing weak variants.
- Preferred entrypoint note: `/ctf-escalate` overlaps with `/ctf-control` and `/ctf-stop-gate`. Prefer `/ctf-control` as the default operator-facing control decision helper; keep `/ctf-escalate` for explicit mode/closure/owner escalation decisions.

Return exactly one decision with evidence:
1. CONTINUE: one next high-information probe exists within the current mode.
2. LEDGER: state cleanup is needed before more probing.
3. OWNER: category ownership should be refreshed.
4. CLOSURE: a strong endgame path exists now.
5. ASK_USER: missing inputs block good decisions.
6. RETRO: the solve is exhausted or should be paused for lessons.
7. STOP: broadening would be low-value or risky.
