# Card: pwn.primitive.stdout_file_leak

## Trigger Signals
- stdout structure writable
- FILE/FSOP surface
- output flushes stdout

## Core Idea
stdout FILE leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
# version-specific FILE field corruption
trigger_flush()
```

## Confirm Oracle
libc-adjacent bytes leak.

## Falsify Oracle
FILE checks reject or wrong layout.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- FSOP leak

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- FSOP leak

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
