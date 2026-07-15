---
description: CTF PWN: Create a structured post-solve retro and feedback plan
agent: ctf-pwn
subtask: true
---

Use this command after a solved, failed, blocked, or escalated PWN challenge. The goal is to capture reusable learning without leaking secrets.

Challenge/result context:
$ARGUMENTS

### PWN Retro Workflow

1. Start from `C:\Users\Administrator\.config\opencode\templates\pwn_retro.md`.
2. Fill only evidence-backed fields; leave unknowns blank instead of guessing.
3. Record final status: solved / unsolved / blocked / escalated.
4. Record the mitigation matrix and final primitive.
5. Record wrong branches and failure signatures.
6. If local worked but remote failed, use `remote-local-divergence.md` fields.
7. Record pattern feedback for relevant references:
   - `pwn-route-matrix.md`
   - `heap-version-route-matrix.md`
   - `leak-to-primitive-ladder.md`
   - `remote-local-divergence.md`
   - `seccomp-sandbox-closure.md`
8. Suggest knowledge update candidates, but do not write reusable notes containing live flags, cookies, private keys, tokens, or one-time challenge secrets.
9. If a pattern card was used, call `ctf-pattern-feedback` with confirmed / falsified / led_to_flag / misleading / weak / skipped.
10. If a new reusable lesson is clear, propose a sanitized lesson note path under `lessons/` or `skills/ctf-pwn/references/`.

### Output Contract

Return:

```text
PWN_RETRO_SUMMARY
status: solved|unsolved|blocked|escalated
bug_class:
final_primitive:
final_closure:
wrong_branch:
remote_drift:
pattern_feedback:
knowledge_update_candidates:
next_config_patch:
```

Do not include raw flags except in `agent_flag.txt` or a final user report for the current challenge. Do not store raw secrets in reusable lessons.
