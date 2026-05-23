---
description: Start a structured pwn CTF solve
agent: ctf-pwn
---

Use `ctf-common`, `ctf-terminal`, and `ctf-pwn` skills.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF, lab, benchmark, or local targets.
- Create or update `notes.md`.
- Triage protections and runtime first.
- Reproduce crashes before exploitation claims.
- Prefer pwntools scripts over fragile shell pipes.
- Write `exploit.py` or `solve.py` and only verified final flag to `agent_flag.txt`.
