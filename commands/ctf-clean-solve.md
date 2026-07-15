---
description: CTF post: OMO remove-ai-slop adapted for CTF solve scripts; make solve.py minimal, deterministic, and reproducible
agent: ctf-master
subtask: false
---

Clean a CTF solve script or exploit script for reproducibility.

Script/context:
$ARGUMENTS

Rules:
- Do not change exploit semantics unless a bug is clearly identified.
- Preserve confirmed exploit steps and remove only unneeded AI slop.
- Prefer a minimal deterministic script with parameterized `HOST`, `PORT`, `URL`, or file path.
- Remove unused imports, dead branches, excessive retries, broad brute force, noisy debug prints, duplicate payloads, and unexplained sleeps.
- Keep local/remote mode clear.
- Keep output focused on the final flag or minimal reproduction proof.
- If cleanup could alter behavior, propose a diff/plan first and require verification.
- Preferred entrypoint note: use this after solve stabilization or before archival handoff, not during active primitive discovery.

Return compactly:
1. Slop found.
2. Safe cleanup plan.
3. Behavior-preserving edits to make.
4. Verification command or check.
5. Final expected script behavior.
