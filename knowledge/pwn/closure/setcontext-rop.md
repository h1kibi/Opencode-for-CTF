# Card: pwn.closure.setcontext_rop

## Trigger Signals
- libc base known
- controlled write to hook/callback or function pointer
- need register-rich ORW chain
- setcontext gadget available

## Core Idea
Use setcontext(+offset) to load registers from a crafted ucontext-like frame and pivot into ORW/ROP.

## Minimal Probe

```text
write fake frame to heap/bss
overwrite callback/hook -> setcontext+offset
trigger callback
```

## Confirm Oracle
Registers/rsp load from frame and ORW/read-flag chain executes.

## Falsify Oracle
Wrong offset/layout, hooks removed/unreachable, or frame pointer not controlled.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.closure.orw_seccomp_file_read
- pwn.version.glibc_2_27
- pwn.version.glibc_2_35

## Version / Mitigation Notes
Offset/layout varies by glibc version; hooks removed in 2.34+.

## Pitfalls
- copying 2.27 setcontext+53 blindly to 2.35+
- not validating frame layout in gdb

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.closure.orw_seccomp_file_read
- pwn.version.glibc_2_27
- pwn.version.glibc_2_35

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
