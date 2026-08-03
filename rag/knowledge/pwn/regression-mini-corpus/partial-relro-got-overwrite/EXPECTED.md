# partial-relro-got-overwrite

## Build

```bash
gcc -fno-stack-protector -no-pie -Wl,-z,relro -Wl,-z,lazy -o vuln vuln.c
```

## Expected trigger signals

- Partial RELRO
- GOT writable
- later call through GOT exists
- arbitrary write/fmt write/overflow write must be proven separately

## Expected primitive

- `pwn.primitive.partial_relro_got_overwrite`

## Anti-pattern to avoid

Do not bulk-write across GOT/global page before exact target write is proven.
