---
description: CTF snapshot: Capture a compact best-evidence state for quick recovery and branch discipline
agent: ctf-expert
subtask: false
---

Run CTF Snapshot.

Current solve state:
$ARGUMENTS

Rules:
- Use for lightweight state refresh during hard solves, especially before interruption, before a pivot, after a useful probe, or when the branch feels noisy.
- Do not run new probes in this command.
- This command is a thin snapshot entrypoint. Follow `ctf-expert` as the source of truth for fast-path, branch discipline, and closure override.
- If the state already contains a plausible primitive-to-flag path, recommend endgame control rather than reopening discovery.
- Prefer the compact structure from `templates/ctf_evidence_snapshot.md` when writing or refreshing the snapshot on disk.
- If a stronger structured packet already exists, refresh it instead of inventing new prose. Preferred packet order: `ctf_resume_packet.md` -> `ctf_handoff.md` -> `ctf_evidence_snapshot.md`.
- Default disk target: `work/ctf-evidence/<challenge-slug>/snapshot.md`. If the branch is already resume-critical, refresh `resume.md` first and `snapshot.md` second.
- When a compact controller state refresh is needed, prefer updating `route.json`, `hypotheses.json`, and `primitive.json` through `write-evidence-state` or the dedicated writer scripts before expanding markdown prose.
- If the snapshot changes owner, queue, or closure posture materially, refresh the packet with `ctf:evidence-doctor <challenge-slug>` before leaving the command.

Return style:
- Very compact.
- Return the best evidence snapshot and exactly one recommended next control action: CONTINUE, LEDGER, CLOSE, OWNER, STOP, or ASK_USER.
