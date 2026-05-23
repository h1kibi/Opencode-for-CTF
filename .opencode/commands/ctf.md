---
description: Route and solve an authorized CTF challenge
agent: ctf-misc
---

Use `ctf-router` first.

Challenge info:
$ARGUMENTS

Required workflow:
1. Classify the challenge.
2. Load the relevant `ctf-*` skills.
3. Create or update `notes.md`.
4. Choose the smallest useful toolset.
5. Execute only verified next steps.
6. Write a reproducible solver if possible.
7. Write the verified final flag to `agent_flag.txt` only after proof.

Timebox strategy:
- First 3 minutes: classify category and inventory files/services.
- Next 7 minutes: test top 3 hypotheses only.
- If no progress after 10 minutes: write a stuck summary and choose a new branch.
- If no progress after 20 minutes: generate `failure_report.md` with missing signals.

Do not guess flags.
Do not use hidden benchmark metadata.
Do not attack unrelated systems.
