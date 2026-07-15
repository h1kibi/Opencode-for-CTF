---
description: CTF owner: Set or refresh the primary category owner and supporting surface for a mixed-evidence challenge
agent: ctf-master
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-control` when owner uncertainty is only one part of a broader control problem.
- Keep `/ctf-owner` for explicit mixed-surface owner routing.

Run CTF Owner Routing.

Current evidence:
$ARGUMENTS

Rules:
- Use when a challenge has mixed-category evidence or the current owner feels unclear.
- This command is a thin routing entrypoint. Follow `ctf-master` as the source of truth for owner selection and supporting-surface discipline.
- Choose exactly one primary owner and at most one supporting surface.
- Preferred entrypoint note: `/ctf-owner` is for explicit owner confusion. If you are unsure more broadly which control action is needed, start from `/ctf-control`.

Return style:
- Compact and routing-focused.
- Return the chosen primary owner, optional supporting surface, why it wins, and the next owner-consistent probe.
- Always include a minimal Owner Matrix:
  1. primary owner
  2. strongest supporting surface
  3. why all other visible surfaces are not primary now
  4. handoff trigger
  5. return trigger
  6. closure owner

Mixed-surface discipline:
- Do not allow co-primary owners.
- If evidence is split, prefer the owner that best explains the sink, oracle, or primitive-to-flag closure path, not the loudest visible surface.
- A supporting surface must supply concrete leverage such as source, parser model, decompile clue, token semantics, file format understanding, or a direct closure dependency.
- If a matching owner lesson or lesson modifier plan exists, prefer its owner flip trigger unless live evidence clearly contradicts it.
