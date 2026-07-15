# Frame-indexed callsite reuse

Use this reference when a stack pivot / saved-rbp overwrite can reuse an original function callsite instead of building ordinary ROP.

## Trigger

- Disassembly shows `lea r?, [rbp-k]` followed by `mov rdi, r?` and `call printf/puts` or another useful consumer.
- Saved `rbp` is controllable or a `leave; ret` pseudostack path exists.
- A branch is drifting toward generic gadget hunting while an original callsite can already consume attacker-shaped frame slots.

## First question

Can we set saved `rbp` so `rbp-k` points to a GOT entry, global pointer, controlled string, or fake frame field that the original callsite prints or dereferences?

## First safe checks

1. Run `ctf-pwn-stack-frame-solver` and look for `frame_indexed_first_arg_control` or `original_callsite_reuse_candidate`.
2. Run `ctf-pwn-got-leak-router` with the relevant disassembly/callsite evidence.
3. Use `ctf-pwn-stage-harness preset=leave_ret_pseudostack_midcall` and then `ctf-pwn-stage-delta-runner` to confirm `rbp/rsp/rdi/rsi/rdx` at the reused callsite.

## Closure bias

- A confirmed original callsite leak outranks generic ret2libc gadget rotation.
- A confirmed data/output callsite outranks shell aesthetics if it can print the flag or leak libc directly.

## Risks

- Mid-function reentry may skip prologue initialization.
- `printf` varargs state may be unstable if the callsite is reached with unexpected register/stack state.
- Fake stack alignment and saved frame layout must be verified before final math.

## Stop rule

If two callsite-reuse probes do not show controlled first argument or useful output differential, demote the family and return to the shortest ordinary closure path.
