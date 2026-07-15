# Seccomp / ORW

Use when a pwn challenge has syscall filtering, sandboxing, or shell-spawning routes fail.

## Triggers

- `seccomp`, `prctl`, `seccomp_init`, `seccomp_rule_add`, `sandbox`, or syscall filter strings/imports.
- `/bin/sh` or `system` route crashes or exits unexpectedly.
- Challenge hints mention read flag, syscall, open/read/write, or sandbox.
- `execve` likely blocked.

## First Safe Checks

1. Inspect seccomp policy with `seccomp-tools` or source if available.
2. Identify allowed syscalls and architecture mode.
3. Decide final primitive:
   - `open`/`read`/`write`
   - `openat`/`read`/`write`
   - existing file-printing function
   - `sendfile` or other allowed file-copy syscall
4. Confirm writable memory for path string and ROP chain needs.
5. Build the shortest ORW chain locally before remote adaptation.

## ORW Planning Table

| Need | Evidence |
|---|---|
| Allowed open/openat | seccomp rule/source/tool output |
| Path storage | `.bss`, stack, heap, or controlled buffer |
| Read buffer | writable memory and size |
| Write fd | stdout/socket fd known or leaked |
| Gadgets/syscall | `pop rdi/rsi/rdx/rax`, `syscall`, ret alignment |

## Route Rules

- If `execve` is denied but ORW is allowed, do not keep trying shell payloads.
- If `open` is blocked but `openat` is allowed, use `openat(AT_FDCWD, path, 0)`.
- If raw syscall gadgets are unavailable, look for PLT wrappers or ret2csu-style calls.
- If path string cannot be placed, use an existing `flag` string or write primitive first.

## Stop Rules

- Do not assume `/bin/sh` is viable under seccomp.
- Do not build ORW before proving syscall allowance.
- After two syscall-chain crashes, verify syscall numbers, calling convention, stack alignment, and fd assumptions before changing gadgets.

## Final Script Checklist

- Print seccomp-derived allowed syscall assumption in notes or script comments.
- Store path deterministically.
- Parse output until flag pattern or EOF.
- Keep remote retries low unless failure is clearly network/prompt sync.
