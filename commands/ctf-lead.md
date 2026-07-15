---
description: Start a structured CTF solve with a lead agent that manages phase, state, and routing
agent: ctf-lead
---

Use `ctf-lead`, `ctf-common`, and `ctf-router` first.

Challenge info:
$ARGUMENTS

Lead workflow:
1. Create or update `notes.md` and `.ctf-state.json`.
2. Record challenge name, target, category guess, and flag format.
3. Start in `triage` unless the category is already certain.
4. Use low-cost routing first, then hand off to exactly one specialized command:
   - `/ctf-web ...`
   - `/ctf-pwn ...`
   - `/ctf-rev ...`
   - `/ctf-crypto ...`
   - `/ctf-forensics ...`
   - `/ctf-misc ...`
5. If one critical primitive or two high primitives are confirmed, stop broad probing and switch to closure behavior.
6. When solved or timed out, route to retro and lessons.

Rules:
- Do not guess flags.
- Do not use hidden benchmark metadata.
- Do not attack unrelated systems.
- Keep `notes.md` and `.ctf-state.json` synchronized.

Command layering hint:
- use `/ctf` for route-only triage
- use `/ctf-hard-open` for hard ambiguous challenges
- use `/ctf-fast` for speed-first execution requests under the master controller
- use `/ctf-master` when disciplined branch control is required
