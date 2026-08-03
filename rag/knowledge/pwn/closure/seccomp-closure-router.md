# Seccomp Closure Router

## Purpose

Use this card after seccomp or static/syscall pressure is confirmed. It routes closure by **what is actually allowed**, not by shell habit.

## Case Split

### `execve` blocked, `open/openat/read/write` allowed
- prefer direct ORW / file-read closure
- do not insist on shell

### `open/openat` blocked, existing readable fd likely exists
- prefer read from existing fd, inherited descriptor, or service-controlled file path
- consider stdout/FILE or data-only read closure before shell

### syscall gadgets exist but shell is noisy
- prefer the shortest syscall-oriented file-read path

### x32 or ABI weirdness suspected
- verify ABI and allowed numbers first; do not assume the amd64 shell route still applies

## First Safe Check

Run `ctf-pwn-syscall-orw-check` and extract:
- syscall ABI hints
- allowlist clues
- whether shell or direct file-read is shorter

## Closure Priority

1. existing fd / direct read path
2. ORW / open-read-write
3. FILE/output-based leakage
4. shell only if actually shortest and allowed

## Anti-Pattern

Do not keep trying `system("/bin/sh")` after seccomp already says ORW is the shortest path.

## Stop Rule

If the allowlist remains unknown and the current branch depends on syscall closure, spend the next probe on syscall evidence, not gadget mutation.
