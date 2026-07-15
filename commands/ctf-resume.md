---
description: CTF control: OMO-style CTF resume gate; recover interrupted solves from notes and decision-state without restarting recon
agent: ctf-master
subtask: false
---

Resume an interrupted CTF solve.

Context or path:
$ARGUMENTS

Rules:
- Do not restart broad recon by default.
- First inspect existing `notes.md`, `.ctf-decision-state.json`, `agent_flag.txt`, `solve.py`, and relevant work/extracted directories if present.
- Prefer `templates/ctf_resume_packet.md`-style content first when it exists.
- If the solve came from `ctf-fast` or `ctf-fast`, prefer `templates/ctf_fast_handoff.md`-style content before falling back to freeform notes.
- Prefer `ctf:evidence-doctor <challenge-slug>` or `node scripts/ctf-evidence-doctor.ts <challenge-slug>` when the slug is known but the restart packet quality is uncertain.
- Prefer a fixed `CTF Resume Block` in `notes.md` when available:
  ```markdown
  ## CTF Resume Block
  Target:
  Flag format:
  Category:
  Confirmed facts:
  Blocked paths:
  Top hypotheses:
  Current primitive:
  Last probe:
  Next probe:
  Candidate flag:
  Files:
  ```
- If the block is missing but the solve is non-trivial, reconstruct it compactly before continuing.
- Preferred evidence order under `work/ctf-evidence/` is: `ctf_resume_packet.md` style -> `ctf_fast_handoff.md` style -> `ctf_handoff.md` style -> `ctf_evidence_snapshot.md` style.
- When structured evidence exists, prefer route.json, `hypotheses.json`, `signal-memory.yaml`, and `primitive.json` as the canonical state frame, with markdown handoff files used only to restore human-readable context.
- If the structured files exist but key route/primitive/closure fields are missing, repair the packet first instead of silently resuming from stale notes.
- Summarize last known evidence in at most five lines.
- Restore the current category, primitive, top hypothesis, blocked branches, and next intended probe.
- If decision-state exists, use it as the source of truth and continue with rank/probe/observe/gate discipline.
- If no useful state exists, run the cheapest route/triage probe only.
- Default disk target: `work/ctf-evidence/<challenge-slug>/resume.md`. If the resumed branch still lacks a general handoff record, refresh `handoff.md` after the resume packet stabilizes.

Return compactly:
1. Resume summary.
2. Reconstructed or existing CTF Resume Block.
3. Last confirmed primitive or `none`.
4. Blocked paths.
5. Current top hypothesis.
6. Next one-variable probe or route-gate action.
