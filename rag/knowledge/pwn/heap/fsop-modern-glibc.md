# Card: pwn.heap.fsop_modern_glibc

## Trigger Signals
- FILE structure writable
- libc version known
- stdout/stderr/vtable path reachable

## Core Idea
Modern glibc FSOP. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
# craft version-specific FILE fields
trigger flush/exit
```

## Confirm Oracle
Leak/control path triggers.

## Falsify Oracle
FILE/vtable checks reject.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- FSOP

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- FSOP

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
