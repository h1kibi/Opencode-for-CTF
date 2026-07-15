# openat-orw-seccomp

## Sample type

Metadata-only regression (seccomp behavior is environment-specific).

## Expected trigger signals

- `execve` blocked by seccomp
- `open` filtered or unavailable
- `openat` reachable via syscall/libc

## Expected primitive / closure

- `pwn.closure.openat_orw`

## Minimal probe shape

```text
openat(AT_FDCWD, "flag", 0) -> read -> write
```

## Anti-pattern to avoid

Do not keep forcing `/bin/sh` when a direct `openat` file-read route is shorter.
