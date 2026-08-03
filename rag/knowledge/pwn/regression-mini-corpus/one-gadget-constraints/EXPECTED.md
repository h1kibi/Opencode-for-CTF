# one-gadget-constraints

## Sample type

Metadata-only regression.

## Expected trigger signals

- libc base known
- one_gadget candidate exists
- constraints mention registers or stack slots such as `rsi == NULL`, `rdx == NULL`, `[rsp+0x30] == NULL`

## Expected closure

- `pwn.closure.one_gadget_constraints`

## Anti-pattern to avoid

Do not rotate one_gadget candidates without checking constraints under the active runtime.
