# Card: pwn.primitive.uninitialized_memory_leak

## Trigger Signals
- show prints uninitialized stack/heap
- malloc not cleared
- buffer reused

## Core Idea
Uninitialized memory leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
create(); show()
# compare repeated runs and classify pointer bytes
```

## Confirm Oracle
Stable stale pointer/secret bytes appear.

## Falsify Oracle
Output zeroed/random unrelated.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- stale leak

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- stale leak

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
