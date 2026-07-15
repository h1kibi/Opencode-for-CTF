---
description: CTF REV helper: check local reverse-engineering tool availability and choose fallbacks
agent: ctf-rev
subtask: false
---

Check the local reverse-engineering environment before wasting solve time on missing tooling.

Context:
$ARGUMENTS

Required quick checks, using safe version/help probes where practical:

1. Core native tools: `file`, `strings`, `xxd`, `objdump`, `readelf`, `nm`, `gdb`, `strace`, `ltrace`.
2. Python solver stack: Python version, `z3`, `angr`, `claripy`, `capstone`, `unicorn` availability.
3. Mobile/Java: `aapt`, `apkanalyzer`, `jadx`, `apktool`, `baksmali`, `adb`, `frida`, `frida-ps`, `apkid`, `javap`, `jar`.
4. Bytecode/managed: `wasm2wat` or wasm tools, Python pyc tooling if available, .NET/IL tooling if available.
5. Project tools: `radare2`/`rizin`, Ghidra headless/ReVa/IDA MCP availability when relevant.

Return format:

```text
REV_ENV:
- core_native: ok/missing(...)
- solver_stack: ok/missing(...)
- mobile_java: ok/missing(...)
- bytecode_managed: ok/missing(...)
- project_tools: ok/missing(...)
- fastest_available_route: ...
- install_needed: yes/no, ask_user_for: ...
```

Rules:

- Do not install tools automatically. Package installation remains an ask-gated action.
- If Android tooling is the bottleneck, run `npm run doctor:android-rev` from the OpenCode config directory or use `ctf-android-runtime-check` for device readiness. If a tool is missing, choose the best already-available fallback before asking to install.
- Do not let environment setup replace challenge progress; after this check, run exactly one next evidence-producing RE action.
