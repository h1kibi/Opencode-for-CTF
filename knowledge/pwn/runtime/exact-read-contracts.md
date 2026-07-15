# Exact Read Contracts

## Purpose

This card handles menu programs that mix line-based prompts with exact-length or raw reads such as `read(size+1)`, `recv`, `fgets`, or `scanf`-driven phases.

## Trigger

- source/decompilation shows `read(size+1)` or `read(n)`
- raw payload stage is followed by another menu prompt
- repeated `sendlineafter` / `sendafter` retries change the menu state unpredictably
- exploit failures look like protocol drift instead of route failure

## Contract Types

### Exact-Length Raw Read
- examples: `read(fd, buf, size)`, `recv(fd, buf, n, 0)`
- prefer `send()` / `sendafter()`
- do not append newline unless the parser explicitly strips or expects it
- always ask: does a newline remain buffered for the next menu read?

### Line-Based Read
- examples: `fgets`, `gets`, `readline` wrappers
- prefer `sendline()` / `sendlineafter()`
- model whether the newline is retained in the destination buffer or trimmed later

### Numeric Parse / scanf
- examples: `scanf("%d")`, `atoi`, `strtol`
- separate menu-selection helper from raw payload helper
- keep numeric phases text-only

## First Safe Check

Run `ctf-pwn-menu-contract-probe` with the source/decompilation or notes.

## Helper Template Rule

You should end up with **one helper per menu phase**:
- menu selection helper
- exact raw payload helper
- line text helper

Do not keep changing between them mid-branch.

## Anti-Pattern

**Wrong move:** using `sendlineafter()` on an exact `read(size+1)` path and then treating the leftover newline as proof the exploit route is wrong.

## Stop Rule

If exact-length vs line-based semantics are still unclear, spend the next probe on protocol/helper locking, not on gadget or heap mutation.
