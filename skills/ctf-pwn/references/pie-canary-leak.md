# PIE / Canary Leak

Use when mitigations block direct control-flow exploitation and a leak primitive is needed.

## Triggers

- Canary enabled and stack overflow reaches return state.
- PIE enabled and code addresses are randomized.
- ASLR/libc base needed for ret2libc/ROP.
- Format string, uninitialized read, show/edit menu, stack print, or pointer disclosure exists.

## Leak Targets

| Need | Useful Leak |
|---|---|
| Canary | stack canary via format string, over-read, debug print, uninitialized stack |
| PIE base | return address, function pointer, GOT/PLT/code pointer |
| Libc base | `puts`, `read`, `__libc_start_main`, `_IO_2_1_stdout_`, unsorted bin pointer |
| Heap base | heap chunk pointer, tcache/fastbin/unsorted metadata, show leak |

## First Safe Checks

1. Identify all output paths: format string, show/list, error messages, debug menus, echo behavior.
2. Test one harmless marker to confirm controllable format/output position.
3. For format strings, find offset with bounded `%p` scan, then target stack/canary/code/libc leaks.
4. For heap/menu leaks, prove allocation/free/show order and pointer stability.
5. Calculate base from one known symbol and validate by checking another nearby symbol/gadget when possible.

## Evidence Requirements

- Raw leaked pointer transcript.
- Chosen symbol/offset explanation.
- Base formula, e.g. `libc.address = leak - libc.sym['puts']`.
- Canary format proof, including null-byte behavior if applicable.
- Repeatability across at least two local runs when ASLR matters.

## Stop Rules

- Do not brute-force canaries remotely unless the challenge clearly intends it and the service allows it.
- Do not rotate libc versions until the leak is stable and symbol identity is plausible.
- After 3 leak attempts with no stable pointer, pivot to another output path or source audit.
- Do not treat every hex-like value as a pointer; check canonical range and page alignment.

## Final Chain Use

After leak proof:

1. Re-enter the vulnerable state cleanly.
2. Preserve canary and stack frame layout.
3. Apply PIE/libc/heap base to gadgets/symbols.
4. Move to ret2win, ret2libc, ORW, heap write, or final control primitive.
