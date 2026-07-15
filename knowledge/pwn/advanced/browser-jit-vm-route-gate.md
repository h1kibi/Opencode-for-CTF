# Card: pwn.advanced.browser_jit_vm_route_gate

## Trigger Signals
- custom VM/JIT/wasm/browser challenge
- OOB/addrof/fakeobj signals
- sandbox boundary
- typed arrays/objects

## Core Idea
Reduce to addrof/fakeobj/AAR/AAW before shellcode or sandbox escape.

## Minimal Probe

```text
prove type confusion/OOB
derive addrof/fakeobj
build AAR/AAW primitive
```

## Confirm Oracle
Stable JS/VM primitive exists across runs.

## Falsify Oracle
Optimization/sandbox prevents primitive.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.primitive.arbitrary_write_struct_pointer

## Version / Mitigation Notes
Engine-version and GC stability matter.

## Pitfalls
- jumping to shellcode before AAR/AAW
- ignoring GC/lifetime

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.primitive.arbitrary_write_struct_pointer

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
