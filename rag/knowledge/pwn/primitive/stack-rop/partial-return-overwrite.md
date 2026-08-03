# Card: pwn.primitive.partial_return_overwrite

## Trigger Signals
- short write/off-by-one to saved RIP
- PIE low bytes stable
- nearby target

## Core Idea
Partial return overwrite. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = prefix + p16(target_low16)
```

## Confirm Oracle
Control reaches nearby target.

## Falsify Oracle
High bytes/page mismatch blocks target.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- partial pointer overwrite

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- partial pointer overwrite

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
