---
description: Start a structured crypto CTF solve
agent: ctf-crypto
---

Use `ctf-common` and `ctf-crypto` skills.

Open `skills/ctf-crypto/references/REFERENCE_INDEX.md` first when the primitive family is unclear.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF/lab/local material.
- Create or update `notes.md`.
- Identify primitive, parameters, assumptions, and weakness before coding.
- Prefer `ctf-rsa-probe` for RSA-shaped tasks before manual attacks.
- Build a bounded parameter inventory before brute force or solver work.
- Pivot early to `ctf-misc`, `ctf-rev`, or `ctf-forensics` once the dominant evidence is no longer cryptanalytic.
- Do not brute force without bounds.
- Write `solve.py` or `solve.sage` when practical.
- Write only the verified final flag to `agent_flag.txt`.
