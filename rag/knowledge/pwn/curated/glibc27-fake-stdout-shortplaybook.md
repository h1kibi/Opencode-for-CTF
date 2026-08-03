# glibc 2.27 Fake stdout Short Playbook

## Trigger

Use this card when all of these are broadly true:
- glibc bucket is 2.23–2.27 or the bundled runtime maps to Ubuntu 18.04-era libc
- fake FILE / fake stdout / `_IO_2_1_stdout_` manipulation is plausible
- you need a shorter closure than shell-first ROP
- hook routes or direct shell are possible but not clearly shortest

## First Safe Check

1. Confirm the runtime with `bundled-libc-first.md` and `glibc-version-route-map.md`.
2. Verify whether a write primitive can reach stdout/FILE-adjacent memory or a hook/context route that can pivot into FILE-based leakage.
3. Decide whether fake stdout is shorter than hook+shell or long ROP.

## Shortest Closure Pressure

Prefer fake stdout / controlled FILE leakage when:
- a libc or heap leak is still needed and stdout corruption gives it directly
- seccomp makes shell less attractive
- the branch already exposes a write primitive into long-lived memory

Prefer `setcontext+53` / ORW instead when:
- fake stdout requires too many version-sensitive fields
- direct FILE corruption is unstable
- a context-write route exists and ORW is already shorter

## Typical First Leak Goal

- leak libc or heap through stdout with a minimal fake FILE state
- use the leak to promote either direct read closure, `setcontext+53`, or ORW

## Anti-Pattern

Do not treat fake stdout as a trophy route. If direct ORW or a shorter data-only output path is already viable, demote fake stdout.

## Stop Rule

If the fake stdout path cannot produce a concrete first leak or stable output differential in the next 1–2 probes, rerank against `setcontext+53` and direct ORW.
