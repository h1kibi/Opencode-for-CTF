# Card: pwn.closure.system_binsh_vs_system_cat_flag

## Trigger Signals
- system available
- argument string controllable
- interactive shell unreliable

## Core Idea
system /bin/sh vs cat flag. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
call(system, ptr_to("cat flag"))
# often shorter than interactive /bin/sh
```

## Confirm Oracle
Flag printed directly.

## Falsify Oracle
system blocked or string unavailable.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- closure

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- closure

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
