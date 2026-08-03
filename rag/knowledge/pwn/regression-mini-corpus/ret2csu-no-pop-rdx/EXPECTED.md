# ret2csu-no-pop-rdx

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- RIP controllable
- convenient `pop rdx` missing in binary gadget set
- `__libc_csu_init` gadget pair available

## Expected primitive

- `pwn.primitive.ret2csu_arg_control`

## Anti-pattern to avoid

Do not abandon the route only because `pop rdx` is absent; verify CSU shape first.
