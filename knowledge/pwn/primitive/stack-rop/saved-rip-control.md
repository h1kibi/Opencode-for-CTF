# Card: pwn.primitive.saved_rip_control

## Trigger Signals
- stack overflow into saved return address
- no canary or canary known
- cyclic crash reaches RIP

## Core Idea
Saved RIP control. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = cyclic(length)
# offset = cyclic_find(crashed_rip)
payload = b"A"*offset + p64(test_ret)
```

## Confirm Oracle
RIP lands at controlled marker/test_ret.

## Falsify Oracle
Crash before RIP or canary/input path blocks control.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- ret2win, ret2libc, ROP

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- ret2win, ret2libc, ROP

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
