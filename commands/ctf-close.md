---
description: CTF close: Push an already-strong branch through final closure and flag validation
agent: ctf-expert
subtask: false
---

Run CTF Close.

Current near-endgame state:
$ARGUMENTS

Rules:
- Use after a strong primitive, near-final candidate path, or credible flag-location model exists.
- This command is a thin endgame entrypoint. Follow `ctf-expert` as the source of truth for fast-path, closure override, and low-noise endgame discipline.
- If the branch still needs flag-location modeling or closure ranking, prefer `ctf-closure-gate` behavior.
- If a credible candidate flag or direct extraction path already exists, prefer final validation over more discovery.
- Prefer or refresh `work/ctf-evidence/<challenge-slug>/closure.json` and `final-verification.txt` when the branch is non-trivial.
- If a structured restart artifact already exists, preserve it and update only the closure-specific fields instead of replacing it with freeform prose.
- Refresh `closure.json` and, when the closure path changes meaningfully, also refresh `signal-memory.yaml` so later final review sees the same endgame ranking.

Return style:
- Compact and endgame-focused.
- Return the current primitive, best closure path, next closure probe, and final validation decision.
