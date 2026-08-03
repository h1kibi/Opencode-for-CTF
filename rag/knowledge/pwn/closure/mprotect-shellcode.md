# Card: pwn.closure.mprotect_shellcode

## Trigger Signals
- NX enabled
- syscall/libc mprotect callable
- shellcode storage exists
- page-aligned address known

## Core Idea
Mark a writable page executable and jump to shellcode.

## Minimal Probe

```text
mprotect(page, 0x1000, PROT_READ|PROT_WRITE|PROT_EXEC)
read shellcode to page
jmp shellcode
```

## Confirm Oracle
Shellcode executes or marker syscall observed.

## Falsify Oracle
mprotect denied, page wrong, bad chars, or seccomp blocks exec.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.primitive.srop_sigreturn
- pwn.closure.orw_seccomp_file_read

## Version / Mitigation Notes
Seccomp may block mprotect; arch shellcode matters.

## Pitfalls
- forgetting page alignment
- shellcode badchars/newline truncation

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.primitive.srop_sigreturn
- pwn.closure.orw_seccomp_file_read

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
