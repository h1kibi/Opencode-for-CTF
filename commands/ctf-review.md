---
description: CTF control: OMO-style CTF review gate; audit evidence, hypotheses, loops, and next probe without exploiting
agent: ctf-expert
subtask: false
---

Run the CTF Review Gate for the current solve state.

Context:
$ARGUMENTS

Rules:
- Do not perform exploit attempts.
- Do not broaden recon unless the current branch is blocked.
- Review only available evidence, notes, decision-state, and recent probe outcomes.
- Classify each important observation as CONFIRMS, FALSIFIES, DIFFERENTIAL, BLOCKED, NOISE, or FINAL.
- Enforce top-3 active hypotheses.
- If two same-family probes produced no new differential, require pivot.
- If a flag candidate exists, apply Final Gate and allow at most one cheap confirmation.
- If a final path is already plausible, prefer verifier-style scrutiny over reopening discovery.

Return compactly:
1. Current confirmed facts.
2. False-positive risks.
3. Active top-3 hypotheses with status.
4. Loop/over-enumeration warnings.
5. Exactly one next high-information one-variable probe, or PIVOT, FINAL, or NEED_INFO.
6. Structured state refresh needed: `none` or one of `route.json`, `hypotheses.json`, `signal-memory.yaml`, `primitive.json`, `closure.json`.
