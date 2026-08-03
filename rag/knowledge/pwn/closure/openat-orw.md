# Card: pwn.closure.openat_orw

## Trigger Signals
- seccomp blocks open but permits openat
- ORW route possible
- flag path known/guessable

## Core Idea
Use openat(AT_FDCWD, path, 0) when open is filtered.

## Minimal Probe

```text
openat(-100, "flag", 0)
read(fd, buf, size)
write(1, buf, n)
```

## Confirm Oracle
Flag bytes printed.

## Falsify Oracle
openat denied or path wrong.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.closure.orw_seccomp_file_read
- pwn.primitive.seccomp_filter_read

## Version / Mitigation Notes
Check seccomp allowlist; x32 syscall numbers may differ.

## Pitfalls
- using open when only openat is allowed
- forgetting AT_FDCWD=-100

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.closure.orw_seccomp_file_read
- pwn.primitive.seccomp_filter_read

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
