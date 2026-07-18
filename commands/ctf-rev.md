---
description: Start a structured reverse engineering CTF solve
agent: ctf-rev
---

Use `ctf-common`, `ctf-terminal`, and `ctf-rev` skills.

Open `skills/ctf-rev/references/REFERENCE_INDEX.md` first when multiple reverse artifact families or bottlenecks compete.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on provided CTF/lab/local artifacts.
- Create or update `notes.md`.
- Prefer static analysis before dynamic instrumentation.
- Route by artifact family first: native checker, VM, packed/runtime-unpacked, Flutter, Android/JNI, WASM, Python bytecode, .NET, Go/Rust, crypto-like constants, or hardware-backed checker.
- Extract validation logic into a reproducible solver.
- Verify recovered input or flag against program behavior when possible.
- If a branch stalls, use the family reference index and `references/rev-fallback-matrix.md` before opening another long decompiler pass.
- Pivot early to `ctf-pwn`, `ctf-forensics`, `ctf-misc`, or `ctf-crypto` once the dominant evidence leaves reverse engineering proper.
- Write only the verified final flag to `agent_flag.txt`.
