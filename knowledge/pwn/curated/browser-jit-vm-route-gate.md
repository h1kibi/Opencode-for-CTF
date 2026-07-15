# Browser JIT VM Route Gate

## Trigger

Use this card when the branch involves browser/JIT/WASM/custom VM, `addrof`/`fakeobj`, JIT spraying, or VM bytecode dispatch.

## First Safe Check

1. Confirm this is not simpler native ELF/rev.
2. Identify the object model, memory model, and one safe oracle.
3. Separate memory-corruption primitive proof from final closure assumptions.

## Route Pressure

- Promote object model and primitive ladder first.
- Demote classic ret2libc/heap habits unless the route explicitly becomes native post-escape.

## Stop Rule

If the object/memory model is still fuzzy, stop and reduce the VM/browser primitive before more closure planning.
