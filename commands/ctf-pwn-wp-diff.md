---
description: CTF PWN: Diff a pasted writeup chain against the current exploit chain
agent: ctf-pwn
subtask: true
---

Use `ctf-pwn-wp-diff` when the user provides a relevant writeup excerpt and you want the smallest structured difference between the WP path and the current route.

Context:
$ARGUMENTS

Workflow:
1. Paste the challenge-specific WP section.
2. Paste the current route, blocker, or notes.
3. Compare shared signals, WP-only signals, and current-only signals.
4. Promote only one shortest diff into the next probe.

Output contract:
```text
PWN_WP_DIFF
shared_route_signals:
wp_only_signals:
current_only_signals:
recommended_next_diff:
```
