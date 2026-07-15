---
description: CTF recovery: Resume a hard challenge from the best evidence snapshot instead of restarting recon
agent: ctf-master
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-resume` for normal interrupted-solve recovery.
- Keep `/ctf-recover` for cases where best-evidence snapshot refresh and signal-memory cleanup are the main need.

Run CTF Recovery.

Current interrupted state:
$ARGUMENTS

Rules:
- Use after interruption, timeout, tool failure, context loss, or when the branch state feels noisy.
- Do not restart broad recon unless the best evidence snapshot is genuinely missing or corrupted.
- First refresh the Best Evidence Snapshot in 5 lines or fewer: strongest evidence, current primary owner, best hypothesis, best oracle, current boundary, confirmed primitive if any, nearest flag path, unresolved high-value signals, terminal candidates, next probe, and why not other branches.
- If the chain ledger or hypothesis queue is stale, run ledger discipline first before inventing new probes.
- If unresolved high-value signal debt exists or the interruption may have caused clue loss, run or inline `/ctf-signal-memory` before choosing the next probe.
- Resume from the single best one-variable next probe, not from general exploration.
- If a plausible primitive-to-flag path already exists, switch to closure rather than reopening discovery.
- Preferred entrypoint note: `/ctf-resume` should be the default resume command. Use `/ctf-recover` when recovery specifically needs best-evidence snapshot refresh plus signal-memory cleanup.

Return style:
- Compact and operational.
- Return the refreshed snapshot, whether ledger/signal-memory cleanup is needed, and the exact next probe to resume with.
