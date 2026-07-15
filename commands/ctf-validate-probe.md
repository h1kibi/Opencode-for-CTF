---
description: CTF control: OMO-style CTF probe validator; require a complete one-variable probe contract before non-trivial tests
agent: ctf-master
subtask: false
---

Validate a CTF probe contract before execution.

Proposed probe:
$ARGUMENTS

Rules:
- Do not execute the probe in this command.
- Require a concrete hypothesis, family, controlled variable, baseline, mutant, oracle, confirm condition, falsify condition, and distinguish condition.
- Require a one-variable guarantee: exactly what changes and what stays constant.
- Require risk and state-damage estimate.
- Require fallback/pivot rule if result is BLOCKED or NOISE.
- If source/pattern evidence exists, reference it. If not, cap confidence and require cheap confirmation.
- If same-family attempts already produced no differential twice, return BLOCK and require `/ctf-pivot`.

Return compactly:
1. VALID / INVALID / BLOCK.
2. Missing contract fields.
3. One-variable check.
4. Expected outcome table: CONFIRMS / FALSIFIES / DIFFERENTIAL / BLOCKED / NOISE.
5. Safe next action.
