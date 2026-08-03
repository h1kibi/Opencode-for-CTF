# Card: pwn.primitive.printf_readonly_fmt_leak

## Trigger Signals
- printf(user_input)
- format tokens reflected
- output visible

## Core Idea
Read-only format leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
for i in range(1,40):
    send(f"%{i}$p")
```

## Confirm Oracle
Stable canary/libc/PIE/stack leak map.

## Falsify Oracle
Input is not format-interpreted.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- format string

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- format string

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
