# Card: pwn.closure.ret2dlresolve

## Trigger Signals
- dynamic ELF
- no useful libc leak
- writeable memory for fake structures
- can call plt0/resolver or ret2dlresolve helper

## Core Idea
Forge dynamic linker relocation/symbol/string metadata so resolver resolves system or another libc symbol at runtime.

## Minimal Probe

```text
build fake Elf64_Rela / Elf64_Sym / string table in .bss
call plt0 with relocation index
argument points to /bin/sh or cat flag
```

## Confirm Oracle
Resolver calls desired symbol or writes resolved address.

## Falsify Oracle
Dynamic loader path unavailable, fake structs misaligned, or simpler leak route exists.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.primitive.ret2plt_leak
- pwn.closure.ret2libc_system_binsh

## Version / Mitigation Notes
Sensitive to architecture, RELRO, linker, and pwntools helper assumptions.

## Pitfalls
- using ret2dlresolve when a one-stage GOT leak is available
- forgetting alignment of fake Sym/Rela

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.primitive.ret2plt_leak
- pwn.closure.ret2libc_system_binsh

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
