---
name: ctf-pwn
description: Use for authorized pwn CTF challenges involving native binaries, memory corruption, shellcode, ROP, heap exploitation, format strings, syscall abuse, or pwntools exploit development.
compatibility: opencode
---

# CTF Pwn

## Purpose

Use this skill for binary exploitation. It structures triage, crash reproduction, primitive discovery, exploitation, and reliable pwntools output.

Always combine this with `ctf-terminal` for real-output command discipline.

For format string challenges, load `references/format-string.md`.

For heap or tcache challenges, load `references/heap-tcache.md`.

## Scope

Use only on provided challenge binaries, local services, Dockerized tasks, or explicitly authorized CTF endpoints.

## Inputs

Collect:

- Binary, libc, loader, Dockerfile, source if present, remote host/port if present.
- Architecture, protections, input protocol, normal behavior, and flag format.
- Whether ASLR, PIE, NX, canary, RELRO, seccomp, or sandboxing matters.

## Workflow

1. Triage with `file`, `checksec`, `strings`, `readelf`, and source review if available.
2. Run the binary locally and document normal protocol.
3. Reproduce a crash with controlled input.
4. Determine offset and control primitive.
5. Identify leak primitive if ASLR/PIE/libc resolution is needed.
6. Choose exploitation strategy: ret2win, ret2libc, ROP, SROP, shellcode, format string, GOT overwrite, heap poisoning, or logic exploit.
7. Script interaction with pwntools; avoid fragile one-off shell pipes.
8. Test locally under the same Docker/libc conditions when possible.
9. Only then adapt to remote host/port.

## Exploit Decision Tree

1. Run `file` and `checksec`.
2. If no crash, identify input surface, protocol state, length checks, and logic bugs.
3. If crash exists, confirm whether control is possible with debugger evidence.
4. If RIP/EIP is controlled:
   - NX off: consider shellcode.
   - NX on and PIE off: consider ROP, ret2win, or ret2csu.
   - NX on and PIE on: find an info leak before building final ROP.
5. If format string exists:
   - Find offset.
   - Leak address.
   - Check RELRO.
   - Decide read/write target.
6. If heap bug exists:
   - Identify allocator and libc.
   - Reproduce UAF, double-free, overflow, or off-by-one.
   - Choose tcache, fastbin, unsorted bin, or house technique based on version.
7. If seccomp exists:
   - Inspect allowed syscalls before choosing shell, open-read-write, or ORW ROP.
8. If source exists and memory corruption is unclear:
   - Audit parsing, integer math, array bounds, format strings, and object lifetimes.

## Tool Discipline

- Use scripted `gdb` or batch commands when possible.
- Use `xxd` or Python for binary output parsing.
- Keep payload generation deterministic.
- Record offsets, gadgets, leaks, base addresses, and assumptions in `notes.md`.
- Do not assume a crash means instruction-pointer control; prove it.

## Evidence Requirements

Required evidence includes:

- Protection summary.
- Crash transcript or debugger state.
- Offset calculation.
- Leak calculation if used.
- Local exploit success or clear explanation why only remote can verify.
- Final flag output from the program or service.

## Output Contract

Produce `exploit.py` or `solve.py` with:

- `LOCAL`/`REMOTE` mode or clear target variables.
- Binary/libc paths as variables.
- Comments for offsets and important gadgets.
- Final flag extraction logic.

## Stop Conditions

Stop or ask when required binaries/libc are missing, remote service is unavailable, exploit reliability is too low to verify, or an operation would attack out-of-scope infrastructure.
