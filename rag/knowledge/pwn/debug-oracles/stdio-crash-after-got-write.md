# Card: pwn.debug.stdio_crash_after_got_write

## Trigger Signals
- crash inside printf/fflush/libc stdio
- recent GOT/global bulk write
- stdin/stdout/stderr nearby

## Core Idea
Likely adjacent stdio/global corruption; reduce write size and map section adjacency.

## Minimal Probe

```text
compare exact write vs bulk write
print section symbols around target
```

## Confirm Oracle
Exact write avoids crash.

## Falsify Oracle
Crash occurs without touching stdio adjacency.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.anti.got_page_bulk_write_pollutes_stdio

## Version / Mitigation Notes
This is closure failure, not primitive failure.

## Pitfalls
- using bulk write as falsifier for leak primitive

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.anti.got_page_bulk_write_pollutes_stdio

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
