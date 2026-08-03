# system-cat-flag-vs-binsh

## Sample type

Metadata-only regression.

## Expected trigger signals

- `system` can be called
- command string is controllable or can be placed in memory
- interactive shell is unreliable or unnecessary

## Expected closure

- `pwn.closure.system_binsh_vs_system_cat_flag`

## Minimal probe shape

```text
system("cat flag") or system("cat /flag")
```

## Anti-pattern to avoid

Do not keep polishing interactive `/bin/sh` when direct `cat flag` prints the flag.
