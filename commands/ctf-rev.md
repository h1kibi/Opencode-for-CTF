---
description: Start a structured reverse engineering CTF solve
agent: ctf-rev
---

Use `ctf-common`, `ctf-terminal`, and `ctf-rev` skills.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on provided CTF/lab/local artifacts.
- Create or update `notes.md`.
- Prefer static analysis before dynamic instrumentation.
- Extract validation logic into a reproducible solver.
- Verify recovered input or flag against program behavior when possible.
- Write only the verified final flag to `agent_flag.txt`.
