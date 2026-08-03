# Card: pwn.primitive.frame_indexed_callsite_call

## Trigger Signals
- saved rbp controllable
- argument from [rbp-k]
- original callsite calls printf/puts/system/open

## Core Idea
Frame-indexed callsite call. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = b"A"*off_rbp + p64(arg_target + k) + p64(callsite_before_arg_setup)
```

## Confirm Oracle
Original callsite consumes selected argument.

## Falsify Oracle
Callsite reached but argument not consumed/target invalid.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- original callsite reuse

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- original callsite reuse

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
