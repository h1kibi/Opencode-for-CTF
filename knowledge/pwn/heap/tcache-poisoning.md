# Card: pwn.heap.tcache_poisoning

## Trigger Signals
- glibc 2.26+
- tcache fd write
- same-size malloc controllable

## Core Idea
Tcache poisoning. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
free(a); edit(a, encoded_target)
malloc(size); malloc(size)
```

## Confirm Oracle
malloc returns target.

## Falsify Oracle
safe-linking/size/checks reject.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- tcache

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- tcache

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
