---
description: CTF REV helper: convert reversing evidence into top-3 strategy routes and one next probe
agent: ctf-rev
subtask: false
---

Build a compact reverse-engineering playbook from current evidence.

Evidence:
$ARGUMENTS

Use this when a reverse challenge is non-trivial, hard, stalled, or has multiple plausible routes.

## Required Inputs

- artifact type, architecture/runtime, packer/entropy hints
- strings/imports/resources/manifest/metadata signals
- input boundary and success/failure oracle if known
- constants/tables/bytecode/native bridge/anti-analysis clues
- available tools or missing environment blockers

## Route Families

Score only evidence-backed routes:

1. native checker slice
2. xor/table/simple transform inversion
3. z3 bit-vector constraints
4. angr symbolic execution
5. custom VM lifter
6. unicorn/qiling function emulation
7. Python pyc/PyInstaller bytecode
8. WASM linear-memory checker
9. Android JNI/Frida bridge
10. .NET/IL managed resource/xref
11. Go/Rust runtime-noise filtering
12. crypto constants recognition
13. packed/unpack/trace boundary
14. anti-debug/anti-VM bypass
15. patch-vs-solve decision

## Output Contract

```text
REV_PLAYBOOK:
- current_bottleneck: ...
- route_1: {family, evidence+, evidence-, first_safe_check, confirm, falsify, stop_rule, reference}
- route_2: {...}
- route_3: {...}
- selected_next_probe: exactly one controlled action
- pattern_query: category="reverse" query="..."
- environment_blocker: none/tool_missing(...)
```

Rules:

- Prefer routes that locate or reduce the validation boundary over broad decompilation.
- Prefer executable checker/solver extraction over manual pseudocode reasoning.
- If pattern recall is needed, use `ctf-pattern-card-search category="reverse"` and convert the selected card with `ctf-pattern-to-hypothesis`.
- If tool availability is uncertain and blocks the top route, run `/ctf-rev-check-env` once, then return to the selected route.
