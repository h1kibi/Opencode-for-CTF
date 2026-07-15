# Card: pwn.mitigation.partial_relro

## Trigger Signals
- checksec Partial RELRO
- GOT writable
- lazy binding

## Core Idea
GOT writes may be possible, but GOT reads are possible under both partial/full RELRO.

## Minimal Probe

```text
check memory permissions
test exact write target, not page bulk
```

## Confirm Oracle
Write to GOT changes later call.

## Falsify Oracle
Full RELRO or page read-only.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.primitive.partial_relro_got_overwrite

## Version / Mitigation Notes
Lazy binding can affect unresolved entries.

## Pitfalls
- bulk GOT writes pollute globals

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.primitive.partial_relro_got_overwrite

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
