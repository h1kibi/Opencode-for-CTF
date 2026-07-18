---
description: Toggle ctf-expert divergence mode OFF — return to strict evidence-constrained workflow. Only works in expert mode.
agent: ctf-expert
subtask: false
---

# Diverge Mode — OFF

This command is only valid when the current agent is `ctf-expert`. If not operating in ctf-expert mode, ignore this command.

Delete `work/ctf-evidence/.diverge-mode` to disable divergence mode:

```
rm -f work/ctf-evidence/.diverge-mode
```

## What changes

- Return to default behavior: all analysis and route planning must be **strictly evidence-backed**.
- Speculative entries in Evidence.md should be moved to a separate notes section or removed.
- Route proposals must reference supporting evidence from Evidence.md.

To re-enable divergence mode later, run `/diverge-on`.
