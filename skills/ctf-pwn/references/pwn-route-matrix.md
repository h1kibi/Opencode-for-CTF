# PWN Route Matrix

Use after `ctf-binary-probe` and before selecting the first non-trivial exploit route. This matrix is routing pressure only; live primitive evidence wins.

## No Canary + No PIE

First routes:
1. Direct `win` / `print_flag` / backdoor symbol.
2. Cyclic offset -> ret2win.
3. NX on: simple ROP / ret2libc if imports/leak exist.
4. NX off: shellcode after bad-char and executable-memory check.
5. ret2csu only when ordinary argument gadgets are missing.

First probes:
- `ctf-pwn-crash-probe` for offset/control.
- `ctf-pwn-rop-summary` after control proof.
- Strings/symbol check for `/bin/sh`, `system`, `flag`, `cat flag`.

Stop rules:
- Do not build ROP before offset/control proof.
- If no control after three crash variants, remap protocol/input length/state.

## Canary On

First routes:
1. Format-string leak.
2. Program output/show leak.
3. Forking canary brute force only when a stable fork oracle exists.
4. Non-return overwrite: function pointer, GOT when partial RELRO, vtable, hookless heap target.
5. Logic/file-read route if memory corruption is blocked.

First probes:
- Search for `printf(user)` or uncontrolled format output.
- Check stack leak candidates and menu show paths.
- Check whether crash kills process or only child connection.

Stop rules:
- Do not brute-force canary without fork/retry oracle.
- Do not treat partial overwrite as full control until debugger proves target reachability.

## PIE On

Need one of:
- Binary/code pointer leak.
- Format-string stack leak.
- GOT/PLT/libc leak plus known binary relation.
- Stack return-address leak.

First probes:
- Classify every leak as stack, heap, binary, libc, ld, vdso, kernel, or unknown.
- Compute base only from a known-class pointer.

Stop rules:
- Do not hardcode gadgets before a binary base leak.
- Unknown-class leak cannot drive final ROP.

## NX On + ASLR / Libc Needed

First routes:
1. Leak libc address via PLT/GOT/read primitive.
2. Return to main for second stage.
3. ret2libc `system('/bin/sh')` if shell viable.
4. ORW/direct file-read if shell blocked or seccomp likely.

First probes:
- `ctf-pwn-libc-resolver` when bundled libc exists.
- `ctf-pwn-rop-summary` after control proof.
- Stack alignment check before mutating gadgets.

Stop rules:
- No one_gadget before libc base and constraints.
- Remote drift requires `ctf-pwn-remote-drift-check` before gadget roulette.

## Full RELRO

Avoid:
- GOT overwrite as primary route.

Prefer:
- ret2libc / ROP.
- Stack pivot.
- Heap overlap to non-GOT target.
- Hookless FSOP/exit-handler route when version supports it.
- Direct ORW/read-flag closure.

## Partial RELRO

GOT overwrite enters the queue only with a write primitive. Prefer low-risk read/leak proof before writes.

## Static Binary

First routes:
1. Syscall ROP.
2. SROP if `syscall; ret` and signal-frame control exist.
3. mprotect + shellcode if writable/executable transition is viable.
4. Direct ORW/read-flag.

First probes:
- `ctf-pwn-syscall-orw-check`.
- Gadget inventory for `syscall`, `pop rdi/rsi/rdx/rax`, writable memory.

## Seccomp / Sandbox

First:
1. Inspect allowlist.
2. If `execve` blocked, prefer ORW/read-flag.
3. Choose open/openat/read/write/sendfile/readv/writev based on allowlist.
4. Model file path: `flag`, `/flag`, `./flag`, challenge-specific path, or source-confirmed path.

Stop rules:
- Do not chase shell after blocked `execve` evidence.
- Do not use ORW until writable buffer and output fd/socket are understood.

## Format String

First routes:
1. Read-only offset/leak map.
2. Leak canary/PIE/libc/stack as needed.
3. Decide write target based on RELRO and writable control target.

First probes:
- `ctf-pwn-format-map`.
- Determine positional vs non-positional behavior.
- Test null truncation and stack drift.

Stop rules:
- No `%n` writes before offset map, RELRO, and target writeability are known.

## Heap Menu

First routes:
1. Menu state table.
2. Allocator/glibc version.
3. Prove UAF/double-free/overflow/off-by-one/overlap.
4. Leak if safe-linking/ASLR requires it.
5. Version-gated technique.

First probes:
- `ctf-pwn-heap-menu-map`.
- `ctf-pwn-libc-resolver` when libc exists.
- `heap-version-route-matrix.md`.

Stop rules:
- No named house/tcache technique before primitive and version evidence.
