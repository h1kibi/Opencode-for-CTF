---
description: Start a structured Web CTF solve
agent: ctf-web
---

Use `ctf-common`, `ctf-terminal`, and `ctf-web` skills.

Load specialized Web skills when evidence points to them:

- SQL query construction or database errors: `ctf-web-sqli`.
- Template rendering of user input: `ctf-web-ssti`.
- Server-side URL fetch: `ctf-web-ssrf`.
- File path, download, include, traversal: `ctf-web-lfi`.
- Upload validation, storage, archive extraction: `ctf-web-upload`.
- Browser execution, reflection, DOM sink, admin bot: `ctf-web-xss`.
- Object ownership, tenant boundary, predictable IDs: `ctf-web-idor`.
- JWT, session token, bearer token logic: `ctf-web-jwt`.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF, lab, benchmark, or local targets.
- Create or update `notes.md`.
- Prefer source review before blind probing.
- Use minimal probes and record evidence.
- Maintain a Primitive Ledger after the first non-trivial finding.
- If one critical primitive or two high primitives are confirmed, stop broad probing and switch to Primitive Lock mode.
- Before final exploitation, choose a stable control plane.
- Prefer admin session, backend endpoint, DB-backed field, reloadable/imported file, or debug/log view over blind callback.
- Before any state-changing write/overwrite/restart action, perform a low-risk canary and record the stability guard.
- Do not try more than 3 variants of the same payload family unless the hypothesis changed.
- Write `solve.py` or `solve.js` when practical.
- Write only the verified final flag to `agent_flag.txt`.
