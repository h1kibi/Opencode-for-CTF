# Ret2win / Ret2libc

Use when a stack/control-flow primitive is likely and the binary exposes a direct win path or libc call path.

## Triggers

- `win`, `print_flag`, `backdoor`, `shell`, `system`, `/bin/sh`, or flag-reading symbols/strings.
- Stack overflow with no canary or a known canary leak.
- `puts@plt`, `write@plt`, GOT entries, or other leakable libc/code pointers.
- NX enabled and shellcode is not the cheapest route.

## First Safe Checks

1. Confirm protections: PIE, canary, NX, RELRO.
2. Confirm offset/control with cyclic pattern or debugger evidence.
3. If a win function exists:
   - PIE off: call fixed `win` address.
   - PIE on: first obtain PIE/code leak or locate an intended non-PIE route.
4. If no direct win:
   - leak libc/code pointer with `puts`, `write`, format string, or existing show path.
   - compute base, then call `system('/bin/sh')` or ORW/file-read path.

## Evidence Table

| Evidence | Required Proof |
|---|---|
| Offset/control | cyclic offset, overwritten RIP/EIP, or controlled return proof |
| Win route | exact address, calling convention, stack alignment if needed |
| Libc leak | leaked symbol, parsed address, libc/base calculation |
| Final call | local success or remote-equivalent transcript |

## Route Rules

- Prefer ret2win over ret2libc when a direct flag/win function exists and mitigations allow it.
- Prefer ret2libc over one_gadget rotation when a stable libc leak exists.
- Use stack alignment (`ret`) on amd64 when `system`/libc calls crash due to alignment.
- If RELRO is full, avoid GOT overwrite routes unless another write target exists.
- If seccomp is present, load `seccomp-orw.md` before choosing shell.

## Stop Rules

- Do not try multiple one_gadget offsets without a verified libc base and constraints.
- Do not build ROP before offset/control is proven.
- After two failed final-call attempts with the same leak/base, verify alignment, calling convention, and prompt sync before changing strategy.

## Final Script Checklist

- `LOCAL`/`REMOTE` switch.
- Binary/libc/ld paths as variables.
- Deterministic leak parsing.
- Base calculations printed or asserted.
- Final flag extraction and `agent_flag.txt` write only after verification.
