---
description: CTF PWN: Diagnose bundled libc runtime alignment before heap/overlap validation
agent: ctf-pwn
subtask: true
---

Use `ctf-pwn-libc-runtime-doctor` when a challenge ships `libc.so.6` and optionally `ld`, or when local heap/overlap/tcache behavior looks inconsistent with the assumed base image.

Context:
$ARGUMENTS

Workflow:
1. Identify `binary`, `libc`, and `ld` if present.
2. Run `ctf-pwn-libc-runtime-doctor`.
3. Record:
   - recommended image/service/profile
   - explicit loader command
   - hard stop condition if current base is mismatched
4. If the doctor reports a mismatched base, stop heap/overlap/tcache validation until the substrate is corrected.

Output contract:
```text
PWN_LIBC_RUNTIME_DOCTOR
recommended_image:
recommended_profile:
explicit_loader_command:
stop_condition:
```
