---
description: CTF PWN: Lock menu/raw read helper semantics before probe drift
agent: ctf-pwn
subtask: true
---

Use `ctf-pwn-menu-contract-probe` when a menu challenge mixes line-based input with exact-length or raw reads such as `read(size+1)`, `recv`, or `fgets`-driven phases.

Context:
$ARGUMENTS

Workflow:
1. Provide the relevant source/decompilation or menu I/O notes.
2. Extract whether the contract is exact-length, line-based, scanf/numeric, or mixed.
3. Define one helper contract before continuing exploit probes.

Output contract:
```text
PWN_MENU_CONTRACT
contracts:
helper_contract:
recommended_send_mode:
notes:
```
