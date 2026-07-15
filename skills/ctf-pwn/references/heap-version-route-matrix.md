# Heap Version Route Matrix

Use when menu allocator, UAF, double-free, off-by-one, overflow, tcache/fastbin/unsorted-bin, or glibc allocator evidence appears. Version and primitive evidence must drive technique selection.

## First Questions

Record before naming a technique:

| Question | Required Evidence |
|---|---|
| allocator/glibc version | bundled libc, Docker image, `ldd`, banner, symbols, `ctf-pwn-libc-resolver` |
| operations | add/delete/edit/show/list/exit |
| index rules | bounds, reuse, negative index, duplicate free behavior |
| size rules | min/max, exact sizes, bin class, realloc behavior |
| lifetime | dangling pointer, nulling, reuse, use-after-free window |
| leak source | show freed chunk, unsorted leak, heap pointer, libc pointer, stack/environ |
| write primitive | edit freed chunk, overflow into next chunk, partial overwrite, arbitrary write |
| closure target | return address, function pointer, vtable, FILE, exit handler, stack pivot, ORW chain |

## glibc <= 2.23

Common routes:
- fastbin dup.
- unsafe unlink when chunk metadata and unlink checks are controllable.
- house of spirit / force when layout supports it.
- unsorted-bin leak to libc.
- `__malloc_hook` / `__free_hook` may be viable.

Avoid:
- Assuming tcache exists.

## glibc 2.26 - 2.27

Common routes:
- tcache dup / poisoning.
- fastbin dup when tcache is saturated or disabled for that size.
- unsorted-bin leak.
- hooks may still be viable.

First probes:
- Determine tcache size class and duplicate-free behavior.
- Check whether show-after-free leaks heap/libc.

## glibc 2.28 - 2.31

Common routes:
- tcache poisoning with version-specific double-free checks.
- unsorted leak to libc.
- overlapping chunks.
- hook overwrite if write primitive reaches hooks.

First probes:
- Confirm tcache duplicate protection behavior.
- Find leak before final hook/ROP plan if ASLR blocks target.

## glibc 2.32 - 2.33

Safe-linking likely matters.

Common routes:
- heap leak -> decode/protect tcache fd.
- tcache poisoning after key/leak strategy.
- overlap -> arbitrary write.
- hooks may still exist but require correct version and write primitive.

Stop rules:
- Do not attempt raw tcache fd overwrite without heap leak or safe-linking bypass.

## glibc >= 2.34

Important gate:
- `__malloc_hook` and `__free_hook` are no longer primary targets.

Common routes:
- hookless FILE/FSOP only with strong version/layout evidence.
- exit handlers / `__exit_funcs` when writable and reachable.
- stack pivot via `environ` leak or saved return overwrite.
- function pointer / vtable / application object overwrite.
- ORW/ROP after stack/control pivot.
- direct flag read through application logic if memory exploitation is expensive.

Stop rules:
- Do not keep hook overwrite in top queue.
- Prefer application-specific control targets over generic old-hook payloads.

## glibc >= 2.35 / Modern Hardened Heap

Bias:
- Source/menu primitive quality matters more than named technique memory.
- Prefer overlap, arbitrary write, stack leak/pivot, app object overwrite, or ORW closure.
- Use local harness/Docker to confirm behavior before remote attempts.

## Primitive-to-Route Map

| Primitive | Route Bias |
|---|---|
| UAF + show | leak heap/libc, then tcache/overlap/write target |
| UAF + edit | tcache poisoning or object overwrite, version-gated |
| double free | tcache/fastbin route only after version check |
| off-by-one null | consolidation/overlap route, allocator-version gated |
| heap overflow | next-chunk metadata, size field, object/function pointer overwrite |
| arbitrary write | closure target selection before extra heap manipulation |
| libc leak only | still need write/control primitive; do not stop at leak |
| no leak + safe-linking | find heap leak, app object target, or non-heap closure |

## Closure Priority

Once a heap primitive is confirmed, choose the shortest stable closure:

1. Direct app object/function pointer to win/read-flag.
2. Stack pivot / saved return overwrite if stack address is known.
3. Hookless libc/control target compatible with version.
4. ORW/direct file read if shell is blocked or unreliable.
5. Shell only when `execve` and I/O are viable.

## Hard Brakes

- No version -> no named technique.
- No primitive proof -> no house/tcache route.
- Safe-linking with no heap leak -> no raw poisoned fd attempts.
- glibc >= 2.34 -> no malloc/free hook route.
- Three heap payload variants without new leak/control/state differential -> remap menu/state/version or escalate.
