# GOT Page Bulk Write Pollutes stdio

## Trigger Signals
- Partial RELRO or writable GOT-adjacent page.
- A bulk read/write starts at or near GOT/global pointer region.
- `.got.plt`, `.data`, `.bss`, `stdin`, `stdout`, or `stderr` are close in memory.
- Program crashes inside libc stdio after a large write.

## Core Idea
A write intended to patch a GOT/global target can spill into adjacent stdio globals or FILE pointers. This is a constructed-environment failure, not proof that the shortest leak primitive is wrong.

## Minimal Probe

```python
# write only the exact target-sized field first
payload = fit({target_offset: p64(value)}, length=exact_len)
# compare with bulk write that spans stdin/stdout/stderr
```

## Confirm Oracle
Exact write preserves stdio while bulk write crashes or corrupts output.

## Falsify Oracle
Crash occurs before the write or adjacent stdio/global pointers are not touched.

## Common Targets
- `printf@got`
- `puts@got`
- `exit@got`
- `stdout` / `stdin` / `stderr` global pointers

## Closure Paths
- GOT overwrite only after exact target write is proven.
- Prefer a read-only GOT leak if closure write risks stdio pollution.

## Version / Mitigation Notes
- Full RELRO blocks GOT writes, not reads.
- Layout depends on linker/script and binary sections.

## Pitfalls
- Treating stdio corruption as a failure of the original callsite leak primitive.
- Using one large read from the GOT page before mapping adjacent globals.

## Anti-patterns
- Bulk GOT-page rewrite before primitive leak validation.

## Related Cards
- `pwn.primitive.got_stringified_pointer_leak`
- `pwn.primitive.partial_relro_got_overwrite`
- `pwn.anti.over_reconstructed_fake_stack_before_callsite_probe`
