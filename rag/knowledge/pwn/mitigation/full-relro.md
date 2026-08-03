# Card: pwn.mitigation.full_relro

## Trigger Signals
- checksec Full RELRO
- GOT read-only

## Core Idea
Demote GOT overwrite; keep GOT leaks and use return/heap/FILE/data-only alternatives.

## Minimal Probe

```text
verify GOT read works
choose non-GOT write target
```

## Confirm Oracle
GOT read leaks but write denied.

## Falsify Oracle
Writable GOT despite checksec due unusual mapping.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.primitive.got_stringified_pointer_leak

## Version / Mitigation Notes
RELRO affects writes, not reads.

## Pitfalls
- abandoning GOT leak because GOT write blocked

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.primitive.got_stringified_pointer_leak

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
