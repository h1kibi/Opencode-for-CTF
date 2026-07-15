# Expected Behavior: bundled-libc-hard-gate

## Scenario

Challenge ships a bundled `libc.so.6` and optionally `ld-linux`, but the operator starts from a generic pwnlab image that may not match the bundled runtime. Heap, overlap, tcache, or seccomp conclusions would be polluted if validation continues on the wrong base.

## Agent Should

1. Detect bundled `libc.so.6` / `ld` during bootstrap.
2. Trigger `ctf-pwn-libc-runtime-doctor` or an equivalent substrate gate before long validation.
3. Treat the doctor result as a hard gate, not a soft hint.
4. Record the recommended image/service/profile and explicit loader command.
5. Avoid proving heap overlap, tcache behavior, or seccomp closure on a mismatched generic base first.
6. Prefer the bundled loader command or challenge runtime before any repeated gdb/heap experiments.

## Agent Should Not

- Stay on a default Ubuntu 22.04 general image when bundled libc clearly points elsewhere.
- Accept early heap or overlap observations as truth before runtime alignment.
- Continue exploit reduction after the bundled-libc mismatch is known but unresolved.

## Success Signal

- Runtime doctor is invoked or its equivalent decision is explicit.
- The branch records the correct runtime lock before heap/overlap validation.
- The next exploit probe runs on the corrected base or the handoff explicitly blocks on runtime alignment.
