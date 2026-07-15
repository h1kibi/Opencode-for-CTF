# Heap Family First Questions

Use before naming heap techniques. The goal is to avoid technique-first drift.

## First Signals

- Menu operations: add/delete/edit/show/list/exit.
- UAF, double free, overflow, off-by-one, realloc, index confusion, size confusion.
- Freed chunk can still be viewed or edited.
- Chunk sizes map to tcache/fastbin/smallbin/unsorted classes.

## Mandatory Reduction Table

| Field | What to record |
|---|---|
| glibc/allocator | bundled libc, Docker image, version, safe-linking likelihood |
| operation semantics | alloc/free/edit/show behavior and prompt sync |
| index lifetime | nulling after free, duplicate free allowed, stale pointer retained |
| size class | requested size vs real chunk size, bin class |
| leak oracle | freed chunk show, unsorted fd/bk, heap pointer, libc pointer |
| write primitive | edit-after-free, overflow length, partial/full overwrite |
| target | app object, function pointer, stack pivot, FILE, exit handler, ORW |

## Fast Route

1. Build menu state table with `ctf-pwn-heap-menu-map`.
2. Resolve libc with `ctf-pwn-libc-resolver` when available.
3. Prove one primitive before technique naming.
4. Consult `heap-version-route-matrix.md`.
5. Choose shortest closure target.

## False Positives

- Crash after free is not UAF control.
- Duplicate delete UI success is not double-free if pointer is nulled.
- Heap leak alone is not exploitability without write/control primitive.
- Old hook route is invalid on glibc >= 2.34.

## Stop / Pivot Rule

After three heap payload variants without new leak, overlap, write, or lifecycle evidence, stop mutation and remap menu semantics, allocator version, and closure target.

## Query Terms

heap menu tcache safe linking, UAF show edit, glibc 2.34 hookless heap, unsorted leak to primitive, heap overlap app object overwrite
