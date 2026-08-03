# partial-pointer-overwrite

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- only low byte of function pointer or return pointer is controllable
- target is nearby in same mapping/page
- high bytes remain stable

## Expected primitive

- `pwn.primitive.partial_pointer_overwrite`

## Anti-pattern to avoid

Do not model partial overwrite as full arbitrary write; prove same-page/low-byte reachability.
