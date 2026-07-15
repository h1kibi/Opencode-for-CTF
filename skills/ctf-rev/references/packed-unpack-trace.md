# Packed / Self-Modifying Binary

Use when entropy, section names, import scarcity, runtime code writes, or unpacker stubs indicate packed or self-modifying code.

## Triggers

- High entropy executable sections, tiny imports, UPX/custom packer strings, RWX sections.
- `VirtualProtect`, `mprotect`, `mmap`, `WriteProcessMemory`, code writes then jumps.
- Static strings are missing but runtime output exists.

## First Safe Checks

1. Identify packer clue and whether UPX/simple unpack applies.
2. Run in controlled local/sandboxed environment only.
3. Trace memory permission changes and jumps into newly written/executable memory.
4. Dump post-unpack code or hook final compare before deep static analysis.
5. Continue with normal checker slicing on dumped/unpacked code.

## Unpack Ledger

| Stage | Address | Event | Dump Candidate | Evidence |
|---|---:|---|---|---|

## Stop Rules

- Do not manually reverse a packer stub if runtime dump reveals the real checker faster.
- Do not run unknown binaries outside a controlled challenge workspace.
- If unpacking stalls, switch to targeted dynamic trace of input boundary and compare function.
