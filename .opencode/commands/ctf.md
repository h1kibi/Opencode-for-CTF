---
description: Route an authorized CTF challenge with evidence-weighted triage
agent: ctf-router
---

Use `ctf-router` and do not deep-solve unless the task is trivial.

Challenge info:
$ARGUMENTS

Route-only workflow:
1. Inventory artifacts, services, target scope, and flag format.
2. Create or update the evidence-weighted triage section in `notes.md`.
3. Score likely categories by evidence, confidence, and cheapest verification.
4. Recommend exactly one next command:
   - `/ctf-web ...`
   - `/ctf-pwn ...`
   - `/ctf-rev ...`
   - `/ctf-crypto ...`
   - `/ctf-forensics ...`
   - `/ctf-misc ...`
5. Do not deeply solve unless the category is obvious and the next step is trivial.

Timebox strategy:
- First 3 minutes: classify category and inventory files/services.
- Next 7 minutes: test top 3 hypotheses only.
- If no progress after 10 minutes: write a stuck summary and choose a new branch.
- If no progress after 20 minutes: generate `failure_report.md` with missing signals.

Do not guess flags.
Do not use hidden benchmark metadata.
Do not attack unrelated systems.
