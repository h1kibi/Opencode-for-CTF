# Card: pwn.heap.unsorted_bin_leak

## Trigger Signals
- large freed chunk
- show freed chunk
- fd/bk main_arena

## Core Idea
Unsorted bin leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
free(large); show(large)
```

## Confirm Oracle
main_arena/libc pointer appears.

## Falsify Oracle
Chunk goes to tcache/fastbin or no show.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- libc leak

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- libc leak

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
