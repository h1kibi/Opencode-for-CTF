# Kernel PWN Routing Card

Use when evidence contains `bzImage`, `vmlinux`, `initramfs`, `rootfs.cpio`, `*.ko`, `/dev/*` challenge devices, ioctl handlers, QEMU launch scripts, SMEP/SMAP/KPTI/KASLR, `commit_creds`, `prepare_kernel_cred`, `modprobe_path`, `core_pattern`, eBPF, or kernel heap/race terms.

Imported long-form references:
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\kernel.md`
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\kernel-techniques.md`
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\kernel-bypass.md`

## First Route Gate

Before exploitation, extract these facts:

| Fact | Why it matters |
|---|---|
| QEMU command / run script | Mitigations, GDB port, rootfs, device args |
| `bzImage` / `vmlinux` / `System.map` | Gadget and symbol source |
| `initramfs` / `rootfs.cpio` | Flag location, exploit delivery, helper files |
| Vulnerable module/source | ioctl/read/write handlers and object lifetime |
| Mitigations | KASLR, FGKASLR, SMEP, SMAP, KPTI, oops=panic |
| Kernel config | `CONFIG_USERFAULTFD`, `STATIC_USERMODEHELPER`, SLUB hardening |
| Interface | `/dev`, `/proc`, ioctl numbers, read/write semantics |

## First Safe Checks

1. List artifacts and identify QEMU launch flags.
2. Extract rootfs into `extracted/` only with safe extraction.
3. Extract `vmlinux` if missing and practical.
4. Map module entrypoints: `init`, `file_operations`, `ioctl`, `read`, `write`, `mmap`.
5. Run one benign device interaction to confirm protocol; do not start brute-force races yet.

## Mitigation Routing

- No SMEP/SMAP: ret2usr may be viable, but still prefer kROP/controlled return if stable.
- SMEP enabled: build kernel ROP; use `prepare_kernel_cred(0)` -> `commit_creds()` or direct cred overwrite.
- KPTI enabled: require `swapgs_restore_regs_and_return_to_usermode` / trampoline or equivalent iretq return.
- KASLR only: seek info leak from module read, oops/dmesg, `tty_struct.ops`, `seq_operations`, or `/proc/kallsyms` if exposed.
- FGKASLR: prefer data targets (`modprobe_path`, `core_pattern`, cred) or stable exported data/gadgets; do not assume function offsets are stable.
- `STATIC_USERMODEHELPER`: demote `modprobe_path` and consider `core_pattern`, cred overwrite, file write, or kROP.
- userfaultfd disabled: use large `copy_from_user`, CPU pinning, page fault/mprotect/MADV_DONTNEED, or retry loops.

## Primitive Ladder

1. Interface reachable.
2. Leak or controlled crash/oops reproduced.
3. Kernel base / heap object / cred target identified.
4. Write/control primitive proven against harmless target.
5. Mitigations handled.
6. Privilege escalation path chosen.
7. Clean return to userland and flag read verified.

## Closure Choices

Rank shortest stable closure:

1. Direct file read/write primitive to flag or helper output.
2. `modprobe_path` overwrite if allowed and address known/bruteforceable.
3. `core_pattern` pipe command if modprobe blocked.
4. Cred overwrite / `commit_creds(prepare_kernel_cred(0))`.
5. kROP via `tty_struct`, `seq_operations`, fake vtable, stack pivot.
6. Cross-cache / PTE overlap / eBPF advanced path only when simpler closure is blocked.

## Hard Brakes

- Do not run race loops before mapping object lifetime and success oracle.
- Do not continue `modprobe_path` if `STATIC_USERMODEHELPER` is confirmed.
- Do not trust userland addresses in kernel mode when SMEP/SMAP are active.
- Do not mutate kROP gadgets before confirming KASLR base and KPTI return path.
- Do not preserve raw kernel pointers or one-off secrets in reusable notes.
