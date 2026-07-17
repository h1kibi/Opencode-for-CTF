---
description: CTF branch: Re-rank or switch the active branch without losing chain and hypothesis state
agent: ctf-expert
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-control` unless the only question is branch re-ranking or pivot class.
- Keep `/ctf-branch` thin and branch-specific.

Run CTF Branch Control.

Current branch state:
$ARGUMENTS

Rules:
- Use when multiple plausible branches remain, a branch is becoming noisy, or a pivot is being considered.
- This command is a thin branch-control entrypoint. Follow `ctf-expert` as the source of truth for top-3 queue discipline, shared-segment reuse, closure override, and pivot quality.
- If the current branch already has a plausible primitive-to-flag path, prefer endgame control over unnecessary branch expansion.
- Preferred entrypoint note: use `/ctf-control` when you are unsure whether the right next move is BRANCH, OWNER, LEDGER, CLOSE, or STOP. Use `/ctf-branch` only when the control question is specifically branch re-ranking or pivot quality.

Return style:
- Compact and stateful.
- Return the top-3 queue summary, chosen active branch, pivot class if any, and next probe.
