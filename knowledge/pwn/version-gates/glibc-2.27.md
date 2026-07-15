# Card: pwn.version.glibc_2_27

## Trigger Signals
- Ubuntu 18.04 style libc
- tcache present
- hooks still available

## Core Idea
Tcache introduced; hooks commonly usable; setcontext/free_hook routes frequent.

## Minimal Probe

```text
fingerprint libc
test tcache lifecycle
verify hook symbols and setcontext offset
```

## Confirm Oracle
Tcache/hook closure aligns with exact libc.

## Falsify Oracle
Runtime lock points to different libc.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.closure.setcontext_rop

## Version / Mitigation Notes
2.27 writeups are common but offsets are build-specific.

## Pitfalls
- blind setcontext+53 reuse

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.closure.setcontext_rop

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
