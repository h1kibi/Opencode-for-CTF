# Card: pwn.version.glibc_2_32_plus

## Trigger Signals
- glibc >= 2.32
- encoded tcache fd
- heap leak needed

## Core Idea
Safe-linking protects tcache fd; heap leak is needed for reliable poisoning.

## Minimal Probe

```text
leak heap chunk address
decode fd = encoded ^ (chunk>>12)
encode target similarly
```

## Confirm Oracle
Decoded fd is sensible and poisoning works.

## Falsify Oracle
No heap leak or formula wrong.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.heap.safe_linking_decode

## Version / Mitigation Notes
Safe-linking is storage-address based.

## Pitfalls
- using target address for xor shift

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.heap.safe_linking_decode

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
