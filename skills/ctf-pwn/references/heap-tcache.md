# Heap And Tcache Reference

Use this reference for authorized pwn CTF heap challenges involving glibc tcache, fastbins, unsorted bins, UAF, double free, or chunk metadata corruption.

## Triage

1. Identify libc version and allocator behavior.
2. Map menu actions to `malloc`, `free`, edit, show, and index constraints.
3. Reproduce the bug in the smallest sequence possible.
4. Track chunk sizes, allocation order, and lifetime in `notes.md`.

## Common Primitives

- UAF show: leak heap or libc pointer.
- UAF edit: tcache poisoning or metadata corruption.
- Double free: duplicate tcache entry when checks are bypassed.
- Off-by-one/null: size field corruption, consolidation, or overlap.
- Overflow: overwrite next chunk metadata or forward pointer.

## Tcache Checks

- For glibc 2.31 and older, tcache poisoning is often direct after double free or UAF.
- For glibc 2.32+, account for safe-linking: `encoded_fd = target ^ (heap_base >> 12)`.
- Confirm per-bin tcache count limits and whether chunks go to fastbin/unsorted after tcache fills.

## Exploit Targets

- `__free_hook` / `__malloc_hook` only when present in the target libc.
- Return addresses or function pointers when hooks are unavailable.
- FILE structure attacks only after confirming libc version and constraints.
- Application object pointers when allocator hardening blocks libc targets.

## Evidence To Record

- Libc version and allocator assumptions.
- Chunk layout before and after the bug.
- Leak source and base calculations.
- Poisoned pointer encoding if safe-linking is active.
- Final allocation/write path to control flow.
