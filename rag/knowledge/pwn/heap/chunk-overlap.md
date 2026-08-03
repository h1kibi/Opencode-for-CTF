# Card: pwn.heap.chunk_overlap

## Trigger Signals
- size overwrite
- off-by-null
- consolidation/unlink/tcache overlap

## Core Idea
Chunk overlap. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
overflow_size(victim); free_alloc_sequence(); edit(overlap, field)
```

## Confirm Oracle
Two handles overlap same memory.

## Falsify Oracle
Allocator checks fail/no overlap.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- overlap

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- overlap

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
