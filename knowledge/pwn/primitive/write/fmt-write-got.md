# Card: pwn.primitive.fmt_write_got

## Trigger Signals
- printf(user_input)
- %n possible
- target writable
- offset known

## Core Idea
Format string GOT write. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = fmtstr_payload(offset, {target: value}, write_size="short")
```

## Confirm Oracle
Target memory changes and consumer uses it.

## Falsify Oracle
Offset unstable or target read-only.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- fmt write

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- fmt write

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
