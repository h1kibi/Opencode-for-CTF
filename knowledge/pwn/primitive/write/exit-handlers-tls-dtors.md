# Card: pwn.primitive.exit_handlers_tls_dtors

## Trigger Signals
- glibc 2.34+ hooks removed
- arbitrary write exists
- exit path reachable
- libc base known

## Core Idea
Target exit handlers, fini arrays, TLS destructors, or related callback lists when malloc/free hooks are gone.

## Minimal Probe

```text
identify version-specific callback storage
write function pointer / encoded pointer
trigger exit or destructor path
```

## Confirm Oracle
Controlled callback executes on exit/destructor.

## Falsify Oracle
Pointer mangling/layout unknown or exit path not reached.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.version.glibc_2_34_plus
- pwn.heap.fsop_modern_glibc

## Version / Mitigation Notes
Highly glibc-version and pointer-mangling dependent.

## Pitfalls
- assuming old hooks on 2.34+
- not accounting for pointer guard mangling

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.version.glibc_2_34_plus
- pwn.heap.fsop_modern_glibc

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
