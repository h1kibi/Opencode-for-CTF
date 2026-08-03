# Card: pwn.closure.orw_seccomp_file_read

## Trigger Signals
- execve blocked
- seccomp present
- open/read/write possible

## Core Idea
ORW seccomp file read. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
open("flag",0); read(fd, buf, 0x100); write(1, buf, n)
```

## Confirm Oracle
Flag bytes printed.

## Falsify Oracle
Syscall denied/path wrong/no buffer.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- ORW

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- ORW

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
