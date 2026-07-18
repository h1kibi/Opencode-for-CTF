---
description: Start a structured forensics CTF solve
agent: ctf-forensics
---

Use `ctf-common`, `ctf-terminal`, and `ctf-forensics` skills.

Open `skills/ctf-forensics/references/REFERENCE_INDEX.md` first when the artifact surface is unclear.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on provided CTF/lab/local artifacts.
- Preserve originals and work on copies or extracted outputs.
- Create or update `notes.md`.
- Record exact extraction commands, offsets, hashes, and artifact paths.
- Start with preservation and triage, then route by surface to the matching reference.
- Prefer dedicated probes before raw-tool loops.
- Pivot early to `ctf-rev`, `ctf-crypto`, `ctf-misc`, or `ctf-web` once the dominant evidence leaves the forensics family.
- Avoid dumping large binary data into notes.
- Write only the verified final flag to `agent_flag.txt`.
