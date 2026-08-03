# puts-rbp-minus-0x20-leak

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- saved rbp overwrite via oversized read
- original puts callsite consumes frame-local pointer/string
- readable GOT/global target can be selected via `rbp = target + k`

## Expected primitive

- `FRAME_INDEXED_CALLSITE_LEAK`
- variant: `puts(rbp-k)`

## Anti-pattern to avoid

Do not block on missing `pop rdi` before testing original puts callsite reuse.
