---
description: PWN VM opener: binary probe, ELF slice, VM/dispatcher helper, and shortest next reduction step
agent: ctf-expert
subtask: false
---

Open a PWN challenge that smells like a custom VM, bytecode interpreter, dispatcher loop, or mini-interpreter.

Context:
$ARGUMENTS

Rules:
- Stay in PWN fast mode only if the challenge is still reducible through static VM/dispatcher triage and one short next probe.
- Do not pretend this is ret2win/ret2libc if the dominant signal is opcode dispatch, handler tables, or state-slot logic.
- Prefer reduction over payloads: identify dispatcher, opcode field width, read/write handlers, bounds-related handlers, and one highest-risk OOB path first.
- If `ctf-binary-probe` suggests generic ret2libc/ret2system seeds but `ctf-pwn-vm-bytecode-helper` shows dispatcher/handler/state-slot evidence, treat the VM helper as the route owner for the opening round.

Required actions:
1. Run `ctf-binary-probe` on the binary.
2. Run `ctf-elf-slice` with a VM-oriented keyword set if needed to surface dispatcher/handler/disassembly slices.
3. Run `ctf-pwn-vm-bytecode-helper` on the binary or disassembly evidence.
4. If `read_handlers`, `write_handlers`, `bounds_to_offsets`, or `high_risk_paths` are non-empty, base the next probe on those fields rather than generic mitigation strings from `ctf-binary-probe`.
5. Report the shortest next reduction step, not a broad reverse plan.

Output contract, max 20 lines:
```text
PWN_VM_OPEN
binary:
dispatcher_signals:
dispatcher_table:
opcode_width:
read_handlers:
write_handlers:
bounds_handlers:
shared_state_slots:
high_risk_path:
next_probe:
handoff_now: yes/no + reason
```
