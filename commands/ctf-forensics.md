---
description: Start a structured forensics CTF solve
agent: ctf-forensics
---

Use `ctf-common`, `ctf-terminal`, and `ctf-forensics` skills.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on provided CTF/lab/local artifacts.
- Preserve originals and work on copies or extracted outputs.
- Create or update `notes.md`.
- Record exact extraction commands and artifact paths.
- Avoid dumping large binary data into notes.
- Write only the verified final flag to `agent_flag.txt`.
