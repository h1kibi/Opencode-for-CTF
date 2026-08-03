# Card: pwn.version.glibc_2_35

## Trigger Signals
- Ubuntu 22.04 style libc
- safe-linking
- hooks unreliable/removed
- one_gadget constraints

## Core Idea
Use safe-linking-aware heap, return/ORW/one_gadget constraints, FILE/exit alternatives.

## Minimal Probe

```text
runtime lock build-id
classify leak
verify one_gadget constraints before trying
```

## Confirm Oracle
Route works under 2.35 exact layout.

## Falsify Oracle
Crash caused by wrong version/layout.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.closure.one_gadget_constraints
- pwn.heap.fsop_modern_glibc

## Version / Mitigation Notes
Common CTF libc; still build-specific.

## Pitfalls
- glibc 2.27 playbook drift

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.closure.one_gadget_constraints
- pwn.heap.fsop_modern_glibc

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
