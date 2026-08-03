# no-pop-rdi-frame-callsite-leak

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- no need for `pop rdi` if original callsite can be reused
- saved rbp controls frame-relative argument selection
- puts/printf existing callsite can leak readable target

## Expected primitive

- `FRAME_INDEXED_CALLSITE_LEAK` or `frame_indexed_callsite_call`

## Anti-pattern to avoid

Do not block on missing `pop rdi` before testing original frame-indexed callsite.
