# Format String Reference

Use this reference for authorized pwn CTF challenges with `printf`-style user-controlled format strings.

## Triage

1. Confirm the sink: `printf(buf)`, `fprintf(stream, buf)`, `syslog(buf)`, or equivalent.
2. Find the stack offset with markers such as `AAAA.%p.%p.%p` or pwntools `FmtStr`.
3. Determine architecture, endian, PIE, RELRO, canary, NX, and libc version.
4. Identify whether the primitive is leak-only, write-capable with `%n`, or both.

## Leak Plan

- Leak a stack pointer to map argument positions.
- Leak a code pointer for PIE base when PIE is enabled.
- Leak a libc pointer such as `__libc_start_main`, `puts`, or a GOT entry when ASLR matters.
- Leak canary only if a later overflow needs it.

## Write Plan

- Full RELRO: avoid GOT overwrite; target return addresses, hooks only if valid for libc, or application state.
- Partial/no RELRO: consider GOT overwrite after resolving libc or code target.
- Prefer short writes (`%hn` / `%hhn`) for stability.
- Sort writes by target value and account for bytes already printed.

## Pwntools Pattern

```python
from pwn import *

elf = context.binary = ELF("./chall")
p = process(elf.path)

offset = 6
payload = fmtstr_payload(offset, {elf.got["printf"]: elf.sym["win"]}, write_size="short")
p.sendline(payload)
p.interactive()
```

## Evidence To Record

- Offset discovery transcript.
- Leaked addresses and base calculations.
- Write target and protection rationale.
- Local and remote payload differences.
