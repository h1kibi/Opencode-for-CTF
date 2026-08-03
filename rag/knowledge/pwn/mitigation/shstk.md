# Card: pwn.mitigation.shstk

## Trigger Signals
- CET SHSTK property
- traditional ret unexpectedly fails
- shadow stack mismatch suspected

## Core Idea
If truly enforced, traditional ret overwrite triggers mismatch; but checksec property may not mean runtime enforcement.

## Minimal Probe

```text
minimal ret overwrite test
observe signal/exception
compare container runtime enforcement
```

## Confirm Oracle
Ret overwrite blocked by shadow stack behavior.

## Falsify Oracle
Normal ret2win works; property not enforced.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.mitigation.ibt_endbr64

## Version / Mitigation Notes
Runtime/kernel/container controls enforcement.

## Pitfalls
- overreacting to SHSTK property alone

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.mitigation.ibt_endbr64

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
