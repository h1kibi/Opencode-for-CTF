# PWN Quick Reference

## Fast Decision Cards

Use these direct filenames first when the query is about runtime locks, exact reads, or shortest closure:
- `pwn-fast-autonomy.md`
- `pwn-mode-boundary.md`
- `pwn-runtime-trigger-matrix.md`
- `bundled-libc-first.md`
- `wrong-libc-anti-pattern.md`
- `exact-read-contracts.md`
- `glibc27-fake-stdout-shortplaybook.md`
- `free_hook-setcontext-orw.md`
- `seccomp-closure-router.md`
- `runtime-closure-index.md`

## Contest Routing Matrix

| Signal | First Tool | Preferred Fast Template | Escalate When |
|--------|------------|--------------------------|---------------|
| no canary + obvious win symbol | `ctf-pwn-crash-probe` | `pwn_fast_ret2win.py` | offset/control unclear |
| cheap GOT/libc leak | `ctf-pwn-crash-probe` + `ctf-pwn-libc-resolver` | `pwn_fast_ret2libc.py` | multiple libc candidates or unstable leak |
| visible format string | `ctf-pwn-format-map` | `pwn_fast_fmt.py` | write target unclear or drift unstable |
| NX off / shellcode-friendly | `ctf-pwn-crash-probe` | `pwn_fast_shellcode.py` | badchars/placement become dominant |
| seccomp/static | `ctf-pwn-syscall-orw-check` | `pwn_fast_orw.py` | syscall ABI / allowlist uncertain |
| bundled libc / ld present | `ctf-pwn-libc-runtime-doctor` | lock runtime before template | runtime mismatch unresolved |
| exact `read(size+1)` / mixed menu raw | `ctf-pwn-menu-contract-probe` | lock helper contract first | menu pollution or helper drift persists |
| stale read/write UAF | `ctf-pwn-heap-menu-map` + `ctf-pwn-heap-reduction-check` | `pwn_fast_heap_uaf.py` | allocator/version reasoning dominates |
| same-bin double free | `ctf-pwn-heap-menu-map` + `ctf-pwn-heap-reduction-check` | `pwn_fast_heap_df.py` | allocator rejects or key/safe-linking dominates |
| small overflow + pivot gadget | `ctf-pwn-rop-summary` | `pwn_fast_stack_pivot.py` | write path or post-pivot chain unclear |
| missing gadgets but csu shape exists | `ctf-pwn-ret2csu-check` | `pwn_fast_ret2csu.py` | call target wiring unclear |
| syscall gadget + rax setup | `ctf-pwn-syscall-orw-check` | `pwn_fast_srop.py` | sigreturn chain or base assumptions unstable |

Fast lookup for common exploitation techniques.

## ret2win

**When**: No canary, no PIE, `win`/`backdoor`/`print_flag` symbol exists.

**Chain**:
```
[padding to saved RIP] [win_addr]
```

**Tools**: `ctf-pwn-crash-probe` for offset, check `elf.sym` for win.

**Template**: `pwn_fast_ret2win.py`

---

## ret2plt (system@plt)

**When**: No canary, `system` in PLT, control of first arg.

**Chain**:
```
[padding] [pop rdi; ret] ["/bin/sh"] [system@plt]
```

**Alternative**: If no `/bin/sh` in binary, use `puts@plt` to leak GOT, then ret2libc.

---

## ret2libc

**When**: Need libc base, have leak primitive.

**Two-stage**:
1. Leak: `puts(GOT[puts])` → compute libc base
2. Shell: `system("/bin/sh")` with libc base

**Chain**:
```
Stage 1: [pop rdi] [GOT[puts]] [puts@plt] [main]
Stage 2: [pop rdi] [&"/bin/sh"] [system]
```

**Tools**: `ctf-pwn-libc-resolver` for offsets.

**If bundled libc/ld exists**: run `ctf-pwn-libc-runtime-doctor` before trusting heap, overlap, or post-leak closure behavior on a generic base.

**Template**: `pwn_fast_ret2libc.py`

---

## Format String

**When**: `printf(user_input)` or format in source.

**Steps**:
1. `ctf-pwn-format-map` to find offset and leaks
2. Leak canary/PIE/libc as needed
3. Write target (GOT, return address, etc.)

**Common offsets**:
- Stack: `%p.%p.%p...` to find offset
- Write: `%{value}c%{offset}$n` or `%{offset}$n`

**Template**: `pwn_fast_fmt.py`

---

## Shellcode

**When**: NX off (stack/heap executable).

**Steps**:
1. Find writable+executable region
2. Find jump gadget (jmp rsp, call rsp)
3. Place shellcode after return address

**Common shellcode**:
- `shellcraft.sh()` - /bin/sh
- `shellcraft.cat("/flag")` - read flag
- `shellcraft.open("/flag") + read + write` - ORW

**Template**: `pwn_fast_shellcode.py`

---

## ORW (Open-Read-Write)

**When**: Seccomp blocks execve, allows read/write.

**Chain**:
```
open("/flag", 0, 0)
read(fd, buf, size)
write(1, buf, size)
```

**Tools**: `ctf-pwn-syscall-orw-check` for allowlist.

**Closure Router**: if shell is blocked or not shortest, jump to `seccomp-closure-router.md`.

**Template**: `pwn_fast_orw.py`

---

## Exact Read / Menu Contract

**When**: Source or behavior suggests `read(size+1)`, exact-length raw reads, or mixed menu/raw phases.

**First Safe Check**: `ctf-pwn-menu-contract-probe`

**Rule**:
- exact-length raw reads -> `send()` / `sendafter()`
- line-based reads -> `sendline()` / `sendlineafter()`
- numeric phases stay text-only
- lock one helper per menu phase before more exploit mutation

---

## Heap: UAF

**When**: free() doesn't clear pointer, can use after free.

**Steps**:
1. Allocate chunk A
2. Free chunk A (fd pointer set)
3. Show A to leak fd (heap/libc if in unsorted bin)
4. Edit A to overwrite fd → target address
5. Allocate twice to get target address as chunk

**Tools**: `ctf-pwn-heap-menu-map`, `ctf-pwn-heap-reduction-check`

**Template**: `pwn_fast_heap.py`

---

## Heap: Double Free

**When**: Same chunk freed twice (glibc < 2.29).

**Steps**:
1. Allocate A
2. Free A
3. Free A again (tcache: fd points to self)
4. Allocate A → returns same address
5. Allocate B → returns fd of A (can be target)

**Note**: glibc 2.29+ adds key check, need UAF instead.

---

## Heap: Tcache Poisoning

**When**: glibc 2.26-2.31, UAF or double-free.

**Steps**:
1. Free chunk to tcache
2. Overwrite fd pointer to target
3. Allocate twice to get target address

**Targets**: `__free_hook`, `__malloc_hook`, GOT, stack.

---

## ret2csu

**When**: Need to call function with args, limited gadgets.

**Gadgets**:
```
gadget1: pop rbx; pop rbp; pop r12; pop r13; pop r14; pop r15; ret
gadget2: mov rdx, r14; mov rsi, r13; mov edi, r12d; call [r15+rbx*8]
```

**Chain**:
```
[gadget1] [0] [1] [arg1] [arg2] [arg3] [&func] [gadget2] [padding]
```

**Template**: `pwn_fast_ret2csu.py`

---

## SROP

**When**: Have `syscall; ret`, need full register control.

**Steps**:
1. Set rax = 15 (SYS_rt_sigreturn)
2. Call syscall
3. SigreturnFrame restores ALL registers

**Common use**: `execve("/bin/sh", NULL, NULL)` or ORW.

**Template**: `pwn_fast_srop.py`

---

## Stack Pivot

**When**: Small overflow, need larger controlled buffer.

**Gadgets**:
- `leave; ret` (mov rsp, rbp; pop rbp; ret)
- `mov rsp, rbp; pop rbp; ret`
- `add rsp, X; ret`

**Steps**:
1. Overflow to overwrite saved RBP with target address
2. Return to `leave; ret`
3. Stack now at target address with controlled ROP chain

**Template**: `pwn_fast_stack_pivot.py`

---

## Canary Bypass

**When**: Stack canary enabled.

**Methods**:
1. Leak canary via format string or show
2. Brute force (if fork/retry oracle exists)
3. Overwrite non-canary parts (vtable, function pointer)
4. Use other corruption (heap, BSS)

---

## PIE Bypass

**When**: PIE enabled, need binary base.

**Methods**:
1. Leak code pointer (format string, show)
2. Partial overwrite (low bits only change)
3. Return to PLT (no PIE base needed)

---

## ASLR Bypass

**When**: Need libc/stack/heap base.

**Methods**:
1. Leak pointer via GOT/PLT/show/format
2. Partial overwrite
3. Brute force (32-bit easier than 64-bit)

---

## One Gadget

**When**: Have libc base, want single-address shell.

**Requirements**: Check constraints with `one_gadget`.

**Common constraints**:
- rsp+0x30 == NULL
- [rsp+0x50] == NULL
- rax == NULL

**Tools**: `one_gadget` command, `ctf-pwn-libc-resolver`.

---

## GOT Overwrite

**When**: Partial RELRO, have write primitive.

**Targets**:
- `__free_hook` → shell on free()
- `__malloc_hook` → shell on malloc()
- `__exit_handlers` → shell on exit()
- GOT entries → redirect execution

---

## vtable Hijack

**When**: C++ binary, vtable pointer controllable.

**Steps**:
1. Identify vtable pointer in object
2. Overwrite with fake vtable
3. Call virtual function → controlled execution

---

## Quick Command Reference

```bash
# Binary analysis
file ./chall
checksec ./chall
strings ./chall | grep -E "flag|win|system|bin/sh"
readelf -s ./chall | grep -E "win|flag|system"

# Crash analysis
python3 -c "from pwn import *; print(cyclic(200))" | ./chall
gdb -q -batch -ex "r" -ex "info registers" ./chall

# Format string
./chall <<< "%p.%p.%p.%p.%p.%p.%p.%p.%p.%p"

# Heap (if menu)
./chall
> 1  # alloc
> 0x20
> AAAA
> 4  # show
> 0

# Libc analysis
readelf -s libc.so.6 | grep system
strings -t x libc.so.6 | grep "/bin/sh"
one_gadget libc.so.6
```

---

## Template Quick Selection

| Scenario | Template | Key Steps |
|----------|----------|-----------|
| Simple overflow + win | `pwn_fast_ret2win.py` | Find offset, jump to win |
| Leak + ret2libc | `pwn_fast_ret2libc.py` | Leak GOT, compute base, system |
| Format string | `pwn_fast_fmt.py` | Find offset, leak/write |
| NX off | `pwn_fast_shellcode.py` | Shellcode after ret |
| Static/seccomp | `pwn_fast_orw.py` | ORW chain |
| Heap UAF | `pwn_fast_heap_uaf.py` | Alloc/free/show/edit stale pointer |
| Heap double free | `pwn_fast_heap_df.py` | Same-bin duplicate free oracle |
| Limited gadgets | `pwn_fast_ret2csu.py` | CSU gadgets |
| Full reg control | `pwn_fast_srop.py` | Sigreturn frame |
| Small overflow | `pwn_fast_stack_pivot.py` | Pivot to BSS |
