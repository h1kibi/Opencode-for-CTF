# Card: pwn.primitive.ret2plt_leak

## Trigger Signals
- PLT/GOT present
- puts/write/printf@plt callable
- argument control

## Core Idea
ret2plt leak. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = flat({off: [pop_rdi, elf.got["puts"], elf.plt["puts"], elf.symbols["main"]]})
```

## Confirm Oracle
Pointer-shaped GOT leak appears and program returns.

## Falsify Oracle
No argument control or no output path.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- ret2libc leak-first

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- ret2libc leak-first

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
