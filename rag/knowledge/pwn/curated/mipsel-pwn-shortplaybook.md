# MIPSel PWN Short Playbook

## Trigger

Use this card when the binary or runtime is MIPSel.

## First Safe Check

1. Confirm MIPSel little-endian runtime.
2. Re-check calling convention, delay-slot effects, and syscall expectations before replaying x86 habits.
3. Prefer the shortest data-read or logic route if full gadget closure is expensive.

## Route Pressure

- Promote architecture confirmation before payload mutation.
- Prefer direct closure over broad gadget churn.
- Treat copied amd64/ELF assumptions as suspect until the first safe check passes.

## Stop Rule

If the current branch still assumes x86/amd64 control semantics, stop and rebuild the route gate for MIPSel.
