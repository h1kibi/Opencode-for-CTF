# fmt-read-before-write

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- `printf(user_input)`
- visible output
- `%p/%s/%n` surface exists

## Expected primitive

- `pwn.primitive.printf_readonly_fmt_leak`

## Anti-pattern to avoid

Do not promote `%n` write closure before a read-only offset/leak map is built.
