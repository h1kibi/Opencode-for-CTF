# Card: pwn.primitive.stack_leak_environ

## Trigger Signals
- libc base known
- arbitrary read/puts leak exists
- need stack address

## Core Idea
Stack leak via environ. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
target = libc.symbols["environ"]
leak = read_ptr_or_puts(target)
```

## Confirm Oracle
Pointer is stack-shaped and stable.

## Falsify Oracle
Leak not stack-like or environ unavailable.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- stack overwrite

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- stack overwrite

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
