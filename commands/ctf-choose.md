---
description: CTF control: choose fast-lane execution or master-controlled solve posture before solving
agent: ctf-expert
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf` for normal route-only entry and `/ctf-hard-open` for difficult ambiguous starts.
- Keep `/ctf-choose` only as a thin mode-selection helper when the sole question is fast-lane execution vs full master-controlled solving.

Choose the best main CTF mode before solving.

Challenge info:
$ARGUMENTS

Rules:
- Recommend `ctf-fast` when the challenge looks single-URL, low-state, likely one-hop or two-hop, and speed-to-flag matters more than full coverage.
- Recommend `ctf-expert` when source, archives, bytecode, Docker/config, multi-role/authz/workflow, race, deserialization, parser confusion, or other real branch complexity is present.
- Bias toward `ctf-fast` for fresh easy/medium Web tasks with obvious primitives.
- Bias toward `ctf-expert` when the user already reports being stuck, when the challenge has multiple artifacts/services, or when a clean exploit path is not obvious.
- Preferred entrypoint note: for most new challenges, `/ctf` or `/ctf-hard-open` is the better operator-facing entrypoint. `/ctf-choose` is a thin mode-selection helper and should stay lightweight.
- Return only: recommended mode, brief reason, and first action.
