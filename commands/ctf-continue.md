---
description: CTF runtime: inspect or trigger automatic continuation and todo enforcement for the current session
agent: ctf-master
subtask: false
---

Use automatic continuation / todo enforcement controls.

Context:
$ARGUMENTS

Rules:
- Prefer this when a branch keeps going idle with unfinished high-priority work.
- Automatic continuation should be low-risk: continue from strongest current state, do not restart broad recon, and do not trigger destructive actions by itself.
- In this runtime, CTF continuation is intentionally conservative: new CTF sessions do not auto-continue unless you explicitly enable it, and idle nudges are only eligible after a real `busy/retry -> idle` transition.
- Use `status` before disabling it on a hard branch.

Common operations:
- `ctf-continuation-control status`
- `ctf-continuation-control enable`
- `ctf-continuation-control disable`
- `ctf-continuation-control nudge`

Return compactly:
- whether continuation is enabled
- whether the session is idle-eligible
- last todo summary
- whether a nudge is justified now
- any active failure backoff or user pause reason
