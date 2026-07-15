---
description: PWN fast handoff: write compact restart packet for ctf-master
agent: ctf-master
subtask: false
---

Create a compact fast-to-master PWN handoff.

Context:
$ARGUMENTS

Rules:
- Do not write a retrospective.
- Do not invent missing facts. Use `unknown` for gaps.
- Prefer copying/filling `C:\Users\Administrator\.config\opencode\templates\pwn_fast_handoff.md` into the challenge workspace.
- If a slug/evidence directory exists, write to `work/ctf-evidence/<challenge-slug>/pwn_fast_handoff.md`; otherwise write `pwn_fast_handoff.md` in the current workspace.
- Include the path to `exploit.py` even if incomplete.

Required fields:
- target/runtime summary
- mitigation summary
- protocol/input model
- selected fast route
- exploit normal form
- shortest closure family
- exact blocker
- proven primitive or strongest non-proof signal
- stable leaks/base assumptions
- exploit file path and last-good command
- same-family attempts spent
- anti-overcomplication status: bridge primitive vs closure primitive, whether a higher-priority canonical family is still live, and whether the last two rounds actually shortened the exploit chain
- best next master-controlled probe with oracle/falsify condition
- contest_meta: fast_outcome, continue_probability_next_5m, why_not_simple

Output contract:
```text
PWN_FAST_HANDOFF
file_written:
fast_outcome:
strongest_evidence:
blocker:
exploit_path:
 best_next_master_probe:
continue_probability_next_5m:
```
