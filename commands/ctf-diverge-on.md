---
description: Toggle ctf-expert divergence mode ON — allows divergent thinking without strict evidence constraints, useful for misc/crypto/creative directions. Only works in expert mode.
agent: ctf-expert
subtask: false
---

# Diverge Mode — ON

This command is only valid when the current agent is `ctf-expert`. If not operating in ctf-expert mode, ignore this command.

Write `work/ctf-evidence/.diverge-mode` to mark that divergence mode is active:

```
echo "enabled" > work/ctf-evidence/.diverge-mode
```

## What changes

- The default evidence-first constraint is **relaxed**.
- You are **encouraged** to think divergently, brainstorm creative angles, and explore speculative hypotheses.
- Route proposals do **not** require hard evidence backing — plausible conjecture is acceptable.
- This mode is especially useful for:
  - **misc**: puzzles, jails, unconventional encoding chains
  - **cryptography**: creative parameter manipulation, oracle behavior exploration
  - **any direction where rigid evidence slows down discovery**

## What does NOT change

- Workers still return structured evidence.
- Team Mode / Evidence.md / route lifecycle still apply.
- Evidence.md is still updated; it just may contain speculative entries alongside confirmed ones.
- Route states (untested / blocked / dead / live) still use the same judgment rules.

To exit divergence mode, run `/diverge-off`.
