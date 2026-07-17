---
description: CTF control: OMO-style CTF final gate; validate candidate flag and reproduction path before final reporting
agent: ctf-expert
subtask: false
---

Run the CTF Final Gate only.

Candidate and context:
$ARGUMENTS

Rules:
- Do not broaden exploration after a credible flag candidate.
- Do not run destructive or state-changing checks.
- Reject sample, decoy, placeholder, tutorial, or test flags unless challenge evidence proves otherwise.
- Confirm the flag format if provided by the challenge.
- Check the shortest reproduction path: input, primitive, oracle/output, and final extraction.
- Prefer the compact evidence trail under `work/ctf-evidence/<challenge-slug>/` when present; final acceptance should be explainable from `solve-output.txt` and `final-verification.txt` without rereading the entire session.
- If `ctf_resume_packet.md`, `ctf_fast_handoff.md`, or `ctf_handoff.md` already exists under `work/ctf-evidence/<challenge-slug>/`, preserve it as the restart artifact and add final-only proof instead of overwriting the branch history with a final-only summary.
- For white-box/source-derived findings, require the evidence gate before final confidence: real file/symbol/line, controllable source or config reachability, sink/condition, and static slice or runtime/local-harness oracle.
- If the final path depends on a source-derived primitive, include the primitive-to-chain link: source -> sink -> primitive -> closure step -> flag/output.
- Allow at most one cheap confirmation if credibility is uncertain.
- If final is accepted, write only the verified flag to `agent_flag.txt` when practical.
- Default disk target: `work/ctf-evidence/<challenge-slug>/final-verification.txt`. Preserve existing `resume.md`, `handoff.md`, `fast-handoff.md`, and `snapshot.md` as branch history rather than collapsing them into a final-only note.
- Prefer `ctf-verifier` or the equivalent verifier contract when the branch has a candidate flag but the shortest reproduction path or decoy risk is still uncertain.

Return compactly:
1. Candidate classification: REAL_LIKELY / NEED_ONE_CONFIRMATION / REJECT.
2. Evidence supporting or rejecting it.
3. Minimal reproduction path.
4. Evidence gate status for source-derived primitives, or `not_applicable`.
5. One optional cheap confirmation, or `none`.
6. FINAL answer text if accepted.
