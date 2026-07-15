# Card: pwn.primitive.cpp_vtable_object_hijack

## Trigger Signals
- C++ object on heap/global
- virtual call after edit/free
- object pointer/vtable pointer overwrite
- type confusion/UAF

## Core Idea
Overwrite vptr or adjacent function pointer so later virtual dispatch calls controlled target.

## Minimal Probe

```text
overwrite vptr -> fake vtable
fake_vtable[slot] = target
trigger virtual call
```

## Confirm Oracle
Call target reached with expected this/args.

## Falsify Oracle
CFI/vtable check blocks or slot/offset wrong.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.heap.uaf_stale_write
- pwn.closure.output_hijack

## Version / Mitigation Notes
PIE and RELRO less relevant than object layout and dispatch.

## Pitfalls
- not identifying slot index
- forgetting this pointer constraints

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.heap.uaf_stale_write
- pwn.closure.output_hijack

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
