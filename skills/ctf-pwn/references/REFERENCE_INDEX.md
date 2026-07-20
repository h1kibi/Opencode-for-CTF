# PWN Reference Index

Use this file as the top-level trigger map for `skills/ctf-pwn/references/`. Keep the skill thin and route by evidence.

For contest-speed lookups, check `quick-reference.md` first, then `runtime-closure-index.md` for bundled-libc / exact-read / closure-first questions, then jump back here for the deeper route family.

For anti-overcomplication / closure-compression questions, read `pwn-anti-overcomplication.md` before expanding a branch that already has a strong primitive.

Simple-first closure order for `ctf-expert` and `ctf-fast`:
1. direct `win` / direct secret path / shortest ret2win close
2. one classified leak -> one minimal ret2libc or PIE-resolved close
3. read-only format-string or show/leak closure before write-first expansion
4. direct ORW / output-hijack / data-only adjacent consumer
5. only then version-gated heap, FSOP, fake-stdout, setcontext, or heavier branch owners

High-priority direct filenames for retrieval:
- `../../../knowledge/pwn/closure/ret2win-direct.md`
- `../../../knowledge/pwn/closure/ret2libc-leak-first.md`
- `../../../knowledge/pwn/primitive/stack-rop/saved-rip-control.md`
- `../../../knowledge/pwn/primitive/stack-rop/saved-rbp-stack-pivot.md`
- `../../../knowledge/pwn/primitive/leak/got-stringified-pointer-leak.md`
- `../../../knowledge/pwn/closure/fmt-leak-before-write.md`
- `../../../knowledge/pwn/closure/no-canary-no-pie-shortest-rop.md`
- `../../../knowledge/pwn/closure/canary-leak-first.md`
- `../../../knowledge/pwn/closure/pie-base-before-gadget.md`
- `../../../knowledge/pwn/closure/partial-relro-got-write-queue.md`
- `../../../knowledge/pwn/closure/static-orw-before-shell.md`
- `../../../knowledge/pwn/closure/cxx-uaf-dataonly-first.md`
- `../../../knowledge/pwn/closure/frame-indexed-callsite-leak.md`
- `../../../knowledge/pwn/anti-patterns/over-reconstructed-fake-stack-before-callsite-probe.md`
- `../../../knowledge/pwn/anti-patterns/got-page-bulk-write-pollutes-stdio.md`
- `pwn-fast-autonomy.md`
- `pwn-anti-overcomplication.md`
- `pwn-mode-boundary.md`
- `pwn-runtime-trigger-matrix.md`
- `bundled-libc-first.md`
- `wrong-libc-anti-pattern.md`
- `exact-read-contracts.md`
- `glibc27-fake-stdout-shortplaybook.md`
- `free_hook-setcontext-orw.md`
- `seccomp-closure-router.md`

## Route Families

- direct BOF / ret2win / ret2libc / ret2csu
  - `../../../knowledge/pwn/closure/ret2dlresolve.md`
  - `../../../knowledge/pwn/closure/setcontext-rop.md`
  - `../../../knowledge/pwn/closure/mprotect-shellcode.md`
  - `../../../knowledge/pwn/primitive/stack-rop/shellcode-badchars.md`
  - `../../../knowledge/pwn/primitive/stack-rop/saved-rip-control.md`
  - `../../../knowledge/pwn/primitive/stack-rop/ret2plt-leak.md`
  - `../../../knowledge/pwn/primitive/stack-rop/ret2csu-arg-control.md`
  - `../../../knowledge/pwn/primitive/stack-rop/srop-sigreturn.md`
  - `../../../knowledge/pwn/primitive/stack-rop/stack-alignment-movaps.md`
  - `../../../knowledge/pwn/primitive/stack-rop/partial-return-overwrite.md`
  - `../../../knowledge/pwn/closure/ret2win-direct.md`
  - `../../../knowledge/pwn/closure/ret2libc-leak-first.md`
  - `../../../knowledge/pwn/closure/no-canary-no-pie-shortest-rop.md`
  - `../../../knowledge/pwn/closure/canary-leak-first.md`
  - `../../../knowledge/pwn/closure/pie-base-before-gadget.md`
  - `pwn-fast-autonomy.md`
  - `quick-reference.md`
  - `ret2win-ret2libc.md`
  - `pwn-route-matrix.md`
  - `pie-canary-leak.md`

- frame-indexed callsite reuse / saved-rbp pivot / leave-ret pseudostack
  - `../../../knowledge/pwn/primitive/stack-rop/saved-rbp-stack-pivot.md`
  - `../../../knowledge/pwn/primitive/stack-rop/frame-indexed-callsite-call.md`
  - `frame-indexed-callsite-reuse.md`
  - `../../../knowledge/pwn/closure/frame-indexed-callsite-leak.md`
  - `../../../knowledge/pwn/anti-patterns/over-reconstructed-fake-stack-before-callsite-probe.md`
  - `../../../knowledge/pwn/closure/ret2libc-leak-first.md`
  - `pwn-output-hijack-closure.md`
  - tool pressure: `ctf-pwn-stack-frame-solver`, `ctf-pwn-got-leak-router`, `ctf-pwn-stage-harness preset=leave_ret_pseudostack_midcall`, `ctf-pwn-stage-delta-runner`

- format string / leak-first read-write
  - `../../../knowledge/pwn/primitive/leak/printf-readonly-fmt-leak.md`
  - `../../../knowledge/pwn/primitive/write/fmt-write-got.md`
  - `../../../knowledge/pwn/closure/fmt-leak-before-write.md`
  - `quick-reference.md`
  - `format-string.md`
  - `leak-to-primitive-ladder.md`

- calibration / parser side effects / near-success
  - `exploit-calibration.md`
  - `pwn-near-success-classifier.md`
  - `runtime-closure-index.md`

- heap / allocator / version-gated mutation
  - `../../../knowledge/pwn/version-gates/glibc-2.23.md`
  - `../../../knowledge/pwn/version-gates/glibc-2.27.md`
  - `../../../knowledge/pwn/version-gates/glibc-2.31.md`
  - `../../../knowledge/pwn/version-gates/glibc-2.32-plus.md`
  - `../../../knowledge/pwn/version-gates/glibc-2.34-plus.md`
  - `../../../knowledge/pwn/version-gates/glibc-2.35.md`
  - `../../../knowledge/pwn/version-gates/glibc-2.39.md`
  - `../../../knowledge/pwn/heap/house-of-apple2.md`
  - `../../../knowledge/pwn/heap/house-of-banana.md`
  - `../../../knowledge/pwn/heap/uaf-stale-read.md`
  - `../../../knowledge/pwn/heap/uaf-stale-write.md`
  - `../../../knowledge/pwn/heap/tcache-poisoning.md`
  - `../../../knowledge/pwn/heap/safe-linking-decode.md`
  - `../../../knowledge/pwn/heap/unsorted-bin-leak.md`
  - `../../../knowledge/pwn/heap/chunk-overlap.md`
  - `../../../knowledge/pwn/heap/fsop-modern-glibc.md`
  - `quick-reference.md`
  - `heap-family-first-questions.md`
  - `heap-version-route-matrix.md`
  - `heap-tcache.md`
  - `heap-uaf-safe-linking.md`
  - `heap-transaction-reduction.md`
  - `cxx-object-uaf.md`

- data-only / adjacency / hookless closure
  - `../../../knowledge/pwn/primitive/write/exit-handlers-tls-dtors.md`
  - `../../../knowledge/pwn/primitive/write/cpp-vtable-object-hijack.md`
  - `../../../knowledge/pwn/primitive/write/arbitrary-write-struct-pointer.md`
  - `../../../knowledge/pwn/primitive/write/partial-pointer-overwrite.md`
  - `../../../knowledge/pwn/primitive/write/partial-relro-got-overwrite.md`
  - `../../../knowledge/pwn/primitive/write/exit-to-main-loop.md`
  - `../../../knowledge/pwn/anti-patterns/got-page-bulk-write-pollutes-stdio.md`
  - `../../../knowledge/pwn/closure/partial-relro-got-write-queue.md`
  - `../../../knowledge/pwn/closure/cxx-uaf-dataonly-first.md`
  - `free_hook-setcontext-orw.md`
  - `pwn-output-hijack-closure.md`
  - `modern-fsop-cpp-dataonly.md`
  - `partial-control-to-arbitrary-write-read.md`
  - `../../../knowledge/pwn/closure/free_hook_setcontext_orw.md`
  - `../../../knowledge/pwn/anti-patterns/pwn-anti-patterns.md`

- seccomp / syscall / ORW
  - `../../../knowledge/pwn/closure/openat-orw.md`
  - `../../../knowledge/pwn/closure/orw-seccomp-file-read.md`
  - `../../../knowledge/pwn/closure/static-orw-before-shell.md`
  - `seccomp-closure-router.md`
  - `quick-reference.md`
  - `seccomp-orw.md`
  - `seccomp-sandbox-closure.md`
  - `../../../knowledge/pwn/closure/seccomp-closure-router.md`

- runtime alignment / local-vs-remote drift
  - `pwn-mode-boundary.md`
  - `pwn-runtime-trigger-matrix.md`
  - `bundled-libc-first.md`
  - `wrong-libc-anti-pattern.md`
  - `exact-read-contracts.md`
  - `glibc27-fake-stdout-shortplaybook.md`
  - `runtime-closure-index.md`
  - `pwn-runtime-substrate-lock.md`
  - `remote-local-divergence.md`
  - `glibc-version-uncertainty-routing.md`
  - `../../../knowledge/pwn/runtime/bundled-libc-first.md`
  - `../../../knowledge/pwn/runtime/glibc-version-route-map.md`
  - `../../../knowledge/pwn/runtime/exact-read-contracts.md`
  - `../../../knowledge/pwn/curated/glibc27-fake-stdout-shortplaybook.md`
  - tool pressure: `ctf-pwn-libc-runtime-doctor`, `ctf-pwn-menu-contract-probe`, `ctf-pwn-remote-drift-check`, `ctf-pwn-io-diff-check`

- specialized or uncommon families
  - `../../../knowledge/pwn/advanced/kernel-uaf-route-gate.md`
  - `../../../knowledge/pwn/advanced/qemu-device-route-gate.md`
  - `../../../knowledge/pwn/advanced/browser-jit-vm-route-gate.md`
  - `../../../knowledge/pwn/advanced/race-userfaultfd.md`
  - `kernel-pwn.md`
  - `qemu-device-pwn.md`
  - `browser-jit-vm-pwn.md`
  - `pwn-race.md`
  - `../../../knowledge/pwn/curated/kernel-route-gate.md`
  - `../../../knowledge/pwn/curated/qemu-device-route-gate.md`
  - `../../../knowledge/pwn/curated/browser-jit-vm-route-gate.md`
  - `../../../knowledge/pwn/curated/race-ufd-route-gate.md`
  - `../../../knowledge/pwn/curated/windows-x64-shortplaybook.md`
  - `../../../knowledge/pwn/curated/aarch64-pwn-shortplaybook.md`
  - `../../../knowledge/pwn/curated/mipsel-pwn-shortplaybook.md`
  - `../../../knowledge/pwn/runtime/musl-heap-differences.md`

## Trigger Rules

- If control is confirmed but exploit landing is unstable, load calibration before opening a new route family.
- If a direct `win`, direct secret path, one-classified-leak ret2libc, read-only fmt leak, or direct ORW close is still alive, load the matching short closure card before version-gated or heap-heavy references.
- If the branch goal is contest-speed closure with minimum ceremony, load `pwn-fast-autonomy.md` before adding more helper steps.
- If the branch question is "fast lane or rigorous now?", load `pwn-mode-boundary.md` before re-ranking routes.
- If the branch question is "which helper must run before more payload mutation?", load `pwn-runtime-trigger-matrix.md` before longer route docs.
- If a long-lived write exists, check output-hijack / adjacency closure before shell-first expansion.
- If seccomp/static/syscall evidence appears, prefer ORW/file-read routing over shell fixation.
- If bundled `libc.so.6` or `ld` exists, read `../../../knowledge/pwn/runtime/bundled-libc-first.md` and run `ctf-pwn-libc-runtime-doctor` before trusting heap, overlap, or tcache observations on a generic base.
- If exact-length or mixed menu/raw read evidence appears, read `../../../knowledge/pwn/runtime/exact-read-contracts.md` and lock helpers before more payload mutation.
- If heap evidence exists, identify allocator/version/primitive before naming techniques.
- If stale-reference + pointer-shaped leak + repeated allocator actions appear together, force heap reduction before more high-level consumer probing.
- If the branch involves inventory/equipment/description wrappers, load `cxx-object-uaf.md` before trying to infer FSOP/ORW directly.

## Maintenance Rule

When adding a new PWN reference, update this index with:

- trigger evidence
- what decision it helps make
- what existing references it should outrank or complement
