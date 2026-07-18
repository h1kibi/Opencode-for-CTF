---
description: Start a structured miscellaneous CTF solve
agent: ctf-misc
---

Use `ctf-common`, `ctf-terminal`, and `ctf-misc` skills.

Open `skills/ctf-misc/references/REFERENCE_INDEX.md` first when the challenge shape is unclear. Escalate to web, pwn, rev, crypto, or forensics skills once the real category is clear.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF, lab, benchmark, or local targets.
- Create or update `notes.md`.
- Classify the challenge before using heavy tools.
- Prefer a reversible transform, minimal client, or bounded classifier over broad guessing.
- Pivot early to `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, or `ctf-forensics` once the dominant evidence is specialist-family shaped.
- Build a reproducible transform, client, or solver when practical.
- Write only the verified final flag to `agent_flag.txt`.
