# Card: pwn.primitive.partial_pointer_overwrite

## Trigger Signals
- low bytes controllable
- base high bytes stable/leaked
- off-by-one/off-by-null

## Core Idea
Partial pointer overwrite. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
patch(offset, p8(new_low_byte))
```

## Confirm Oracle
Pointer redirects within same mapping/page.

## Falsify Oracle
ASLR/page mismatch.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- partial overwrite

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- partial overwrite

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
