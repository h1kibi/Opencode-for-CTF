---
description: Route an authorized CTF challenge with evidence-weighted triage
agent: ctf-router
---

Use `ctf-router` and do not deep-solve unless the task is trivial.

Challenge info:
$ARGUMENTS

Recommended route profiles:
- Existing branch with `work/ctf-evidence/<challenge-slug>/` already populated -> prefer `/ctf-resume <context>` before fresh routing.
- Unknown/simple challenge with unclear category but likely low ceremony -> prefer `/ctf-fast <context>` as a fast execution request under `ctf-master`.
- Clear ELF/libc/checksec/crash/control evidence -> prefer `/ctf-fast <context>` as the fast lane, even when source, libc, ld, or Docker artifacts are present, unless those artifacts create real branch complexity.
- Source-rich, Java, Docker, archive-heavy, multi-service, or ambiguous hard branch -> prefer `/ctf-hard-open <context>`.
- Already confirmed primitive or near-final candidate -> prefer `/ctf-closure <context>` or `/ctf-final <context>` instead of broad route-only output.

Route-only workflow:
1. Inventory artifacts, services, target scope, and flag format.
2. If there is already a populated `work/ctf-evidence/<challenge-slug>/` branch or restart packet, recommend `/ctf-resume ...` instead of re-running broad triage.
3. Prefer `ctf:evidence-doctor <challenge-slug>` once a stable slug exists and the branch is no longer trivial.
4. If the challenge is clearly hard, source-rich, multi-artifact, or category-ambiguous, recommend `/ctf-hard-open` instead of forcing early deep solve.
5. Create or update the evidence-weighted triage section in `notes.md`.
6. Score likely categories by evidence, confidence, and cheapest verification.
7. Recommend exactly one next command:
   - `/ctf-web ...`
   - `/ctf-pwn ...`
   - `/ctf-rev ...`
   - `/ctf-crypto ...`
   - `/ctf-forensics ...`
   - `/ctf-misc ...`
   - `/ctf-hard-open ...`
   - `/ctf-fast ...`
   - `/ctf-master ...`
   - `/ctf-resume ...`
8. Do not deeply solve unless the category is obvious and the next step is trivial.

Routing bias:
- Prefer `/ctf-fast` for obviously simple one-hop tasks or quick fast-lane validation.
- Prefer `/ctf-master` or `/ctf-hard-open` for source, archives, Docker, bytecode, many artifacts, or competing owners.
- Prefer direct category command only when one owner is already strongly favored by evidence.

Timebox strategy:
- First 3 minutes: classify category and inventory files/services.
- Next 7 minutes: test top 3 hypotheses only.
- If no progress after 10 minutes: write a stuck summary and choose a new branch.
- If no progress after 20 minutes: generate `failure_report.md` with missing signals.

Do not guess flags.
Do not use hidden benchmark metadata.
Do not attack unrelated systems.
