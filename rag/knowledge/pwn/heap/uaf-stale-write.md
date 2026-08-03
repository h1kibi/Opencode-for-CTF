# Card: pwn.heap.uaf_stale_write

## Trigger Signals
- free then edit
- stale pointer writable
- same chunk reusable

## Core Idea
UAF stale write. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
free(i); edit(i, payload)
```

## Confirm Oracle
Metadata/victim field changes.

## Falsify Oracle
Edit blocked or stale pointer invalid.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- heap write

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- heap write

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
