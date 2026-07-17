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
- For fast-vs-rigorous boundary and runtime/helper selection, treat `references/pwn-mode-boundary.md` and `references/pwn-runtime-trigger-matrix.md` as the shared rule source.
- If a high-value primitive already exists, compress the branch before expanding it: write the exploit normal form, ask whether a 20-40 line minimum solve sketch is already possible, and prefer canonical closure over fuller explanation.
- Canonical closure order for PWN execution is: `ret2win` -> `pivot to writable static/global memory` -> `single leak + replay` -> `ORW` -> `shell`, unless a higher route is concretely falsified.
- Distinguish bridge primitives from closure primitives. “One more read / one more replay / one more rewrite” does not outrank a live direct closure primitive unless required by the chosen canonical closure template.
- On Windows for Linux ELF targets, prefer one Linux substrate early; if `ctf-pwn-runner` blocks host execution, move to `ctf-pwn-docker-runner` or `ctf-pwn-wsl-runner` instead of retrying on the host.
- Treat `ctf-binary-probe` `probe_backend: docker_fallback` as the preferred mitigation source when host ELF tooling is incomplete.
- Reproduce crashes before exploitation claims.
- Prefer pwntools scripts over fragile shell pipes.
- For local-vs-remote fixed-read or menu-framing drift, use `references/pwn-runtime-trigger-matrix.md` before rotating gadgets, libc, or exploit family.
- For long Docker transcript debugging, prefer `ctf-pwn-docker-runner` raw log saving and continue from `output_path`.
- If the branch keeps adding local semantic explanation without shortening the exploit chain, consult `references/pwn-anti-overcomplication.md` and rerank before more same-style probing.
- Write `exploit.py` or `solve.py` and only verified final flag to `agent_flag.txt`.
- If the challenge still looks simple after triage, prefer `/ctf-fast`; if runtime alignment, heap/versioning, or closure uncertainty dominate, prefer `/ctf-expert`. Use `references/pwn-mode-boundary.md` when the threshold is unclear.
