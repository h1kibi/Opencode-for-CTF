---
description: Deprecated compatibility entry; use /ctf or /ctf-expert for structured CTF solving
agent: ctf-expert
subtask: false
---

`/ctf-lead` is a compatibility alias for the canonical `/ctf` and `/ctf-expert` workflows.

Challenge info:
$ARGUMENTS

Use the canonical Evidence workspace under `work/ctf-evidence/<case-id>/`. Treat
`case.json` as the machine state source and `Evidence.md` as the human-readable
view. Legacy `notes.md` or `.ctf-state.json` files may be read only for migration;
do not create or synchronize them.

Start with `/ctf` for automatic lane/family routing. Use `/ctf-expert` when
concurrent routes, Evidence, or heavy capabilities are required. `ctf-fast` is
the single fast Agent; family selection changes tool packs and MCP profile, not
the primary Agent identity.
