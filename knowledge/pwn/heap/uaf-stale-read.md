# Card: pwn.heap.uaf_stale_read

## Trigger Signals
- free then show
- stale pointer not nulled
- freed metadata visible

## Core Idea
UAF stale read. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
free(i); show(i)
```

## Confirm Oracle
Heap/libc/safe-linking metadata leaks.

## Falsify Oracle
Pointer cleared or show blocked.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- heap leak

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- heap leak

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
