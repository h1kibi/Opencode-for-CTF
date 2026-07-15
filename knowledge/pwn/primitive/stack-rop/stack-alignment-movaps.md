# Card: pwn.primitive.stack_alignment_movaps

## Trigger Signals
- crash in movaps
- ret2libc enters libc then SIGSEGV
- rsp not 16-byte aligned

## Core Idea
Stack alignment movaps fix. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = b"A"*off + p64(ret) + rop_chain
```

## Confirm Oracle
Crash moves past movaps/prologue.

## Falsify Oracle
Same crash persists because base/arg is wrong.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- alignment debug oracle

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- alignment debug oracle

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
