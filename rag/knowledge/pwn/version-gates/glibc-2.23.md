# Card: pwn.version.glibc_2_23

## Trigger Signals
- Ubuntu 16.04 style libc
- no tcache
- malloc/free hooks available

## Core Idea
Older heap routes: fastbin dup, unsorted leak, malloc_hook/free_hook are often viable.

## Minimal Probe

```text
fingerprint libc build-id
check hooks symbols
choose fastbin/unsorted route only after primitive proof
```

## Confirm Oracle
Symbol/layout matches 2.23 and chosen primitive works.

## Falsify Oracle
Bundled libc differs or target not 2.23.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.heap.unsorted_bin_leak

## Version / Mitigation Notes
No tcache; classic fastbin checks apply.

## Pitfalls
- assuming tcache exists
- using safe-linking logic

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.heap.unsorted_bin_leak

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
