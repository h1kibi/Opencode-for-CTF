# Card: pwn.primitive.partial_relro_got_overwrite

## Trigger Signals
- Partial/No RELRO
- arbitrary write or fmt write
- later call through GOT

## Core Idea
Partial RELRO GOT overwrite. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
write64(elf.got["printf"], libc.sym["system"])
send("/bin/sh\0")
```

## Confirm Oracle
Later call invokes replacement with controlled arg.

## Falsify Oracle
Full RELRO or no later call.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- GOT hijack

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- GOT hijack

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
