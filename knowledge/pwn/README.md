# PWN Knowledge Index

This PWN knowledge base is organized around **signal -> primitive -> minimal probe -> closure -> anti-pattern**, not exploit technique names alone.

It is runtime-aware and closure-first: lock binary/libc/ld/runtime early, validate the shortest primitive, then build the smallest path to flag.

## Primitive-centered directories

- `primitive/stack-rop/`: saved RIP/RBP, callsite reuse, ret2plt, ret2csu, SROP, stack leaks, partial overwrites.
- `primitive/leak/`: GOT/stringified pointer leaks, puts GOT leaks, read-only format leaks, uninitialized leaks, stdout FILE leaks.
- `primitive/write/`: GOT overwrite, fmt write, struct pointer AAR/AAW, partial pointer overwrite, exit-to-main.
- `heap/`: UAF read/write, tcache poisoning, safe-linking, unsorted leak, overlap, modern FSOP.
- `closure/`: direct/ret2libc/fmt/ORW/one_gadget/output closure cards.
- `runtime/`: libc/ld, exact reads, glibc route maps, musl differences.
- `anti-patterns/`: drift signatures and rollback lessons.
- `mitigation/`, `version-gates`, `debug-oracles`: protection/runtime/debug interpretation cards.
- `advanced/`: kernel/QEMU/browser/JIT/race route gates.
- `regression-mini-corpus/`: minimal sample specifications for validating primitive recognition.
- `retrieval-tag-schema.md` and `card-tags.index.json`: structured tag schema and generated index for signal-based retrieval.
- `regression-mini-corpus/INDEX.json`: canonical list of regression cases and their expected primitives.
- `regression-mini-corpus/EXPECTED.schema.md`: machine-readable expected primitive/oracle schema for future scoring.

## Required runtime / closure references

- `bundled-libc-first.md` — lock bundled libc/ld before allocator or gadget validation.
- `glibc-version-route-map.md` — route choices by glibc version.
- `exact-read-contracts.md` — fixed read/menu helper contracts.
- `musl-heap-differences.md` — musl/alpine heap/runtime differences.
- `glibc27-fake-stdout-shortplaybook.md` — glibc 2.27 fake stdout short playbook.
- `free_hook_setcontext_orw.md` — free_hook/setcontext ORW closure.
- `seccomp-closure-router.md` — shell-blocked ORW/file-read routing.
- `ret2dlresolve.md` — dynamic resolver closure when libc leak is unavailable.
- `setcontext-rop.md` — setcontext frame-based register loading / ORW closure.
- `openat-orw.md` — openat-based ORW when open is filtered.
- `mprotect-shellcode.md` — mprotect + shellcode closure.
- `one-gadget-constraints.md` — one_gadget constraints as hard requirements.

## Version / mitigation / debug cards

- `glibc-2.23.md`, `glibc-2.27.md`, `glibc-2.31.md`, `glibc-2.32-plus.md`, `glibc-2.34-plus.md`, `glibc-2.35.md`, `glibc-2.39.md`
- `partial-relro.md`, `full-relro.md`, `ibt-endbr64.md`, `shstk.md`
- `no-current-process-before-breakpoint.md`, `stdio-crash-after-got-write.md`

## Required anti-pattern / template references

- `pwn-anti-patterns.md` — general PWN anti-pattern index.
- `wrong-libc-anti-pattern.md` — wrong-libc validation drift.
- `CARD_TEMPLATE.md` — card writing template.
- `retrieval-fields.md` — retrieval metadata field guidance.

## Curated specialized route gates

- `windows-x64-shortplaybook.md`
- `aarch64-pwn-shortplaybook.md`
- `mipsel-pwn-shortplaybook.md`
- `kernel-route-gate.md`
- `qemu-device-route-gate.md`
- `browser-jit-vm-route-gate.md`
- `race-ufd-route-gate.md`

## Card Contract

Every useful card should include:

- Trigger Signals
- Core Idea
- Minimal Probe
- Confirm Oracle
- Falsify Oracle
- Common Targets
- Closure Paths
- Version / Mitigation Notes
- Pitfalls / Anti-patterns
- Related Cards

## Priority Principle

A card that cannot generate a minimal probe is reference material, not a frontline primitive card.
