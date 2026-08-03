# Card: pwn.heap.safe_linking_decode

## Trigger Signals
- glibc >= 2.32
- encoded tcache fd
- heap leak needed

## Core Idea
Safe-linking decode. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
real_fd = encoded_fd ^ (chunk_addr >> 12)
encoded_target = target ^ (chunk_addr >> 12)
```

## Confirm Oracle
Decoded pointer is sensible and poisoning works.

## Falsify Oracle
Chunk address unknown/nonsense decode.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- safe-linking

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- safe-linking

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
