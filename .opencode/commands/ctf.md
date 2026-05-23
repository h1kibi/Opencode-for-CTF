---
description: Route an authorized CTF challenge and recommend the next command
agent: ctf-misc
---

Use `ctf-router`.

Challenge info:
$ARGUMENTS

Route-only workflow:
1. Classify the challenge.
2. Create or update the triage section in `notes.md`.
3. Recommend exactly one next command:
   - `/ctf-web ...`
   - `/ctf-pwn ...`
   - `/ctf-rev ...`
   - `/ctf-crypto ...`
   - `/ctf-forensics ...`
   - `/ctf-misc ...`
4. Do not deeply solve unless the category is truly misc or ambiguous.

Timebox strategy:
- First 3 minutes: classify category and inventory files/services.
- Next 7 minutes: test top 3 hypotheses only.
- If no progress after 10 minutes: write a stuck summary and choose a new branch.
- If no progress after 20 minutes: generate `failure_report.md` with missing signals.

Do not guess flags.
Do not use hidden benchmark metadata.
Do not attack unrelated systems.
