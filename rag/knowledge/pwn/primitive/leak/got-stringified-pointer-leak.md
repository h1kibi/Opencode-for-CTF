# Card: pwn.primitive.got_stringified_pointer_leak

## Trigger Signals
- printf/puts argument can point at GOT entry
- GOT entry resolved
- output treats pointer bytes as char*

## Core Idea
GOT stringified pointer leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = b"A"*off + p64(got_entry + k) + p64(callsite)
# or puts(got_entry) / printf((char*)got_entry)
```

## Confirm Oracle
Raw libc pointer bytes appear before NUL/crash/EOF.

## Falsify Oracle
Callsite reaches target but bytes not printed.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- frame-indexed leak, ret2libc

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- frame-indexed leak, ret2libc

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
