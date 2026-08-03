# safe-linking-decode

## Sample type

Metadata-only regression (no standalone C file yet).

## Expected trigger signals

- glibc >= 2.32
- tcache fd appears encoded
- heap leak available or required

## Expected primitive

- `pwn.heap.safe_linking_decode`

## Minimal formula

```text
real_fd = encoded_fd ^ (chunk_addr >> 12)
encoded_target = target ^ (chunk_addr >> 12)
```

## Anti-pattern to avoid

Do not use `target >> 12` in place of `chunk_addr >> 12`.
