# Card: pwn.version.glibc_2_34_plus

## Trigger Signals
- glibc >= 2.34
- malloc/free hooks removed
- modern Ubuntu/Debian

## Core Idea
Prefer return overwrite, FILE, exit handlers, vtables, data-only, or ORW over hooks.

## Minimal Probe

```text
confirm hooks absent/unusable
rank hookless closures
verify exact runtime lock
```

## Confirm Oracle
Closure avoids removed hooks.

## Falsify Oracle
Hooks actually exist in bundled libc or simpler route works.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.primitive.exit_handlers_tls_dtors
- pwn.heap.fsop_modern_glibc

## Version / Mitigation Notes
2.34 removed malloc/free hooks from public ABI.

## Pitfalls
- forcing __free_hook

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.primitive.exit_handlers_tls_dtors
- pwn.heap.fsop_modern_glibc

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
