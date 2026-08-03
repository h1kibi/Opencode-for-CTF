# Card: pwn.version.glibc_2_31

## Trigger Signals
- Ubuntu 20.04 style libc
- tcache common
- hooks often still available

## Core Idea
Tcache poisoning and hooks may still be viable; safe-linking may depend on build/distribution.

## Minimal Probe

```text
fingerprint build-id
check safe-linking behavior
verify hooks symbols
```

## Confirm Oracle
Primitive route matches observed allocator behavior.

## Falsify Oracle
Safe-linking/hooks assumptions contradict runtime.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.heap.tcache_poisoning

## Version / Mitigation Notes
Do not infer solely from version string.

## Pitfalls
- wrong safe-linking assumption

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.heap.tcache_poisoning

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
