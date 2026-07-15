# Card: pwn.primitive.puts_got_leak

## Trigger Signals
- pop rdi or equivalent
- puts@plt available
- GOT readable

## Core Idea
puts GOT leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = flat({off:[pop_rdi, elf.got["puts"], elf.plt["puts"], elf.symbols["main"]]})
```

## Confirm Oracle
puts leaks a libc pointer and returns/restarts.

## Falsify Oracle
No argument control/output path.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- classic ret2libc

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- classic ret2libc

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
