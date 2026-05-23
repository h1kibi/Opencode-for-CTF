---
name: ctf-rev
description: Use for authorized reverse engineering CTF challenges involving binaries, APKs, crackmes, obfuscation, anti-debugging, VM logic, decompilation, symbolic reasoning, or dynamic instrumentation.
compatibility: opencode
---

# CTF Reverse Engineering

## Purpose

Use this skill to recover validation logic, secrets, encodings, algorithms, or flags from compiled programs and mobile apps.

Use `ctf-terminal` for command, debugger, emulator, Frida, or adb interactions.

## Scope

Use only on provided challenge files, local apps, emulators, or explicitly authorized targets.

## Inputs

Collect:

- File type, architecture, hashes, packaging, symbols, strings, imports, resources, and execution requirements.
- For APKs: manifest, activities, services, assets, native libraries, dynamic loaders, and network endpoints.
- Expected input and flag format.

## Workflow

1. Triage with file type, strings, imports, sections, entropy, and packing indicators.
2. Locate entry points and validation paths.
3. Find comparisons, transforms, constants, encoders, crypto loops, and error messages.
4. Rename important functions and variables in notes or decompiler when possible.
5. Extract logic into `solve.py` rather than patching blindly.
6. Use dynamic analysis only to confirm static hypotheses or handle anti-analysis/VM logic.
7. For mobile, inspect Java/Kotlin, native libraries, assets, reflection, dynamic loading, and network behavior.
8. Verify recovered input or flag against the program/app when possible.

## Tool Discipline

- Prefer static analysis first.
- Use decompilers for structure and disassembly for exact semantics.
- Avoid running unknown binaries outside a controlled environment.
- Do not over-trust decompiler output; verify arithmetic, signedness, and pointer behavior.
- Record function names, addresses, constants, and algorithm summaries in `notes.md`.

## Evidence Requirements

Reverse conclusions require:

- Code path or address evidence.
- Extracted transform or comparison logic.
- Reconstructed input generation.
- Verification by running the binary/app or matching exact comparison logic.

## Output Contract

Produce `solve.py` when practical. Include extracted constants and algorithm steps. Write `agent_flag.txt` only after verification.

## Stop Conditions

Ask or stop when execution requires unsafe privileges, malware-like behavior is suspected outside a sandbox, dynamic instrumentation needs a device/emulator not available, or packed code cannot be unpacked with available tools.
