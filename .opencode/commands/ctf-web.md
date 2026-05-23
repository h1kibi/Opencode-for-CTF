---
description: Start a structured Web CTF solve
agent: ctf-web
---

Use `ctf-common`, `ctf-terminal`, and `ctf-web` skills. Load `ctf-web-sqli`, `ctf-web-ssti`, or `ctf-web-ssrf` when evidence points to that bug class.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF, lab, benchmark, or local targets.
- Create or update `notes.md`.
- Prefer source review before blind probing.
- Use minimal probes and record evidence.
- Write `solve.py` or `solve.js` when practical.
- Write only the verified final flag to `agent_flag.txt`.
