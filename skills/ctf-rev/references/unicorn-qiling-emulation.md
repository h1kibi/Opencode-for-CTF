# Unicorn / Qiling Emulation

Use when the checker can be isolated but native execution is noisy, anti-debugged, platform-bound, or requires controlled memory/register setup.

## Triggers

- A target function/checker address is known.
- Inputs and constants are in memory/registers and can be mapped.
- External syscalls, files, network, GUI, or Android runtime block normal execution.
- You need intermediate state traces or compare-hook output.

## First Safe Checks

1. Identify function start/end, architecture, calling convention, and argument registers/stack.
2. Map code, rodata, stack, heap, and input buffers.
3. Initialize registers and memory from real trace or static evidence.
4. Hook compare/output/branch points to validate semantics.
5. Run 1-2 known test inputs and compare with native behavior when possible.

## Emulation Ledger

| Region | Address | Size | Source | Purpose |
|---|---:|---:|---|---|
| Register | Value | Source | Meaning |

## Stop Rules

- Do not emulate the whole program when a checker function can be isolated.
- If setup uncertainty dominates, collect one native trace before adding more hooks.
- Do not trust emulation until at least one concrete output matches the real oracle or exact reconstructed checker.
