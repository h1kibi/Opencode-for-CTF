---
description: CTF runtime: create and manage a real multi-session CTF team using lead/member orchestration
agent: ctf-master
subtask: false
---

Use the CTF Team Mode runtime.

Context:
$ARGUMENTS

Rules:
- Use this only for non-trivial branches where parallel information gain is justified.
- Team Mode is for controlled fanout, not uncontrolled parallel exploitation.
- The lead remains responsible for merge, owner selection, closure, and final verification.
- Prefer small teams: scout + librarian + oracle first; add domain members only when a clear scoped question exists.
- Each member task must have a strict question, expected output shape, and a kill condition.
- Do not let members run broad fuzzing, repeated bot triggers, or high-risk state-changing actions unless the lead explicitly authorizes that branch.

Suggested operation flow:
1. `ctf-team-mode create_team`
2. `ctf-team-mode add_member` for exactly the members needed for the current round
3. In `ctf-master` round validation, prefer up to 3 members aligned to the current top-3 hypotheses
4. `ctf-team-mode create_task` once per member with a narrow prompt
   - hypothesis
   - confirm condition
   - falsify condition
   - expected oracle
   - budget / safety constraint
5. `ctf-team-mode status` to inspect member sessions and task state
6. `ctf-team-mode complete_task` or `ctf-team-mode block_task` after merge

Round model note:
- Team Mode should mirror the master workflow: `FAST_INTAKE` does not need full fanout, while `PARALLEL_VALIDATE` may use up to 3 parallel validation members.
- If one member returns a likely real flag, the lead should stop or suspend the other active tasks when practical and move to finalization.

Return compactly:
- whether Team Mode is justified
- suggested member set
- the first strict task for each member
- one merge rule for the lead
