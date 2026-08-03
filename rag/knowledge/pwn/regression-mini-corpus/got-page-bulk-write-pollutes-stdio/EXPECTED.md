# got-page-bulk-write-pollutes-stdio

## Build

```bash
gcc -fno-stack-protector -no-pie -o vuln vuln.c
```

## Expected trigger signals

- bulk read into global area
- adjacent global/stdio-like pointer can be overwritten
- crash/output corruption after wide write is closure-environment failure

## Expected card

- `pwn.anti.got_page_bulk_write_pollutes_stdio`

## Minimal probe shape

Compare exact target-sized write with a bulk write that crosses adjacent globals.

## Oracle

Exact write preserves output; bulk write changes/corrupts adjacent pointer/output.
