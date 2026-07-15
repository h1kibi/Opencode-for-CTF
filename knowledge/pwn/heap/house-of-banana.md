# Card: pwn.heap.house_of_banana

## Trigger Signals
- glibc exit/function list surface
- arbitrary write
- need hookless modern closure
- libc base known

## Core Idea
Hijack link_map/rtld or exit-related structures for modern hookless control.

## Minimal Probe

```text
map target structures for exact libc
write controlled pointers
trigger exit/runtime path
```

## Confirm Oracle
Controlled function path executes.

## Falsify Oracle
Layout/version mismatch or trigger unavailable.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.primitive.exit_handlers_tls_dtors
- pwn.runtime.bundled_libc_first

## Version / Mitigation Notes
Advanced and version-gated; use only after simpler closures blocked.

## Pitfalls
- using as first heap idea
- not locking libc/ld build-id

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.primitive.exit_handlers_tls_dtors
- pwn.runtime.bundled_libc_first

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
