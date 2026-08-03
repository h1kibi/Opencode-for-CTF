# static ORW before shell

## Trigger
- Static binary, syscall-heavy target, or sandboxed shell path is present.
- The branch is still chasing shell aesthetics.

## Why it looks promising
- Medium static binaries often close faster through ORW or direct file-read than through full shell recovery.

## What usually goes wrong
- The solver spends time searching for `execve`-like closure even when syscall surface already favors open/read/write.

## Better question
- What is the smallest syscall/file-read chain that reaches the flag path with the current control primitive?

## First safe check
- Run `ctf-pwn-syscall-orw-check`, confirm writable buffer and output fd, and test one direct ORW/read-flag chain.

## Oracle
- One direct file-read path works or produces a stronger differential than shell-first attempts.

## Stop rule
- Do not keep forcing shell once syscall evidence says ORW is shorter.

## Pivot rule
- If ORW cannot be assembled under the current control width, downgrade to the smallest reachable read/output closure.
