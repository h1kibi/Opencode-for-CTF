---
description: CTF endgame: Push a near-final branch from closure discipline into final validation without reopening discovery
agent: ctf-master
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-close` for active low-noise endgame execution.
- Prefer `/ctf-final` for candidate-flag validation.
- Keep `/ctf-endgame` only for explicit CLOSE_MORE / FINAL_NOW / NOT_READY / ABANDON_ENDGAME classification.

Run CTF Endgame.

Current near-final branch state:
$ARGUMENTS

Rules:
- Use when a high-value primitive exists and the branch is close to flag recovery or final validation.
- Do not use this command for pre-primitive discovery.
- First check whether the branch needs more closure modeling or is already ready for final validation.
- If the exact flag path is still uncertain, refresh the Flag Location Model and choose the top closure probe.
- If a credible candidate flag or direct extraction path already exists, prefer final validation over further exploration.
- Do not open a new bug family, hidden route hunt, or broad enumeration during endgame.
- If the branch fails in endgame, classify the failure as wrong flag location, wrong privilege boundary, wrong oracle, blocked closure path, or not-final-yet.
- Legacy note: `/ctf-endgame` overlaps with `/ctf-close` and `/ctf-final`. Prefer `/ctf-close` for active closure execution and `/ctf-final` for final validation. Keep `/ctf-endgame` as a classifier when you specifically need CLOSE_MORE / FINAL_NOW / NOT_READY / ABANDON_ENDGAME.

Return exactly one outcome with evidence:
1. CLOSE_MORE: one more closure step is needed.
2. FINAL_NOW: ready for final validation.
3. NOT_READY: branch is still too weak for endgame; name the missing condition.
4. ABANDON_ENDGAME: current branch should leave endgame and return to branch/ledger control.

Also return the exact next command or probe that should follow.
