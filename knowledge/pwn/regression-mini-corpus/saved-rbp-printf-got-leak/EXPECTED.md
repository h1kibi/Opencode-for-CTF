# saved-rbp-printf-got-leak

## Build

```bash
gcc -fno-stack-protector -no-pie -z noexecstack -o vuln vuln.c
```

## Expected trigger signals

- saved rbp overwrite via oversized read into stack buffer
- original callsite prepares printf argument from frame-local buffer
- no PIE, GOT readable

## Expected primitive

- `FRAME_INDEXED_CALLSITE_LEAK`
- `rbp = target + k`
- `rip = original callsite before argument setup`

## Minimal probe shape

```python
payload = b"A"*off_rbp + p64(printf_got + k) + p64(callsite_before_arg_setup)
```

## Oracle

Raw GOT/libc pointer bytes are printed before crash/EOF.
