# failure-rev-hidden-semantic-carrier-missed

## Trigger
- Visible `.text` checker looks too weak, underconstrained, or partially patched out, while the binary still stages meaningful data into registers, stack slots, exception state, or detached metadata-linked structures.

## Why it looked promising
- The visible control flow seemed to explain enough of the validation path that deeper metadata or unwind state looked unnecessary.

## What usually goes wrong
- Hidden semantic carriers such as `.eh_frame`, `.debug_frame`, `.gcc_except_table`, `DW_CFA_val_expression`, init/fini arrays, or TLS-linked state contain the real consumer, and the solve path is abandoned too early as “removed” or “decoy”.

## Better question
- What hidden semantic carrier could still consume the staged data, and has one metadata/unwind pass actually ruled that out?

## First corrective probe
- Run one metadata-semantic pass: `readelf --debug-dump=frames`, `readelf -wf`, inspect `.eh_frame`, `.debug_frame`, `.gcc_except_table`, and search for `DW_CFA_val_expression` / `DW_OP_*` before concluding the checker is absent.

## Stop rule
- Do not conclude “logic removed” or “checker patched out” until the hidden-semantic pass is negative.

## Reuse query terms
- reverse hidden semantics
- eh_frame
- debug_frame
- dwarf unwind
- DW_CFA_val_expression
- DW_OP
- metadata consumer
- exception path
