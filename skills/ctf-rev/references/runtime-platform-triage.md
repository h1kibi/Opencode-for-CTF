# Runtime / Platform Triage

## Triggers

Load before committing to a reverse-engineering toolchain when the target could be ELF, PE, .NET, Java/Android, WASM, a script/bytecode bundle, firmware, or a runtime-generated checker. The purpose is to identify the loader, ABI, execution substrate, and validation boundary before deep analysis.

## First Safe Inventory

Record:

- container and magic bytes, architecture, endianness, bitness, ABI, entrypoint, interpreter/loader, and linked/runtime libraries;
- symbols, sections, imports/exports, resources/assets, embedded archives, bytecode version, and debug/unwind metadata;
- expected input/output channel, success/failure strings, sandbox/device assumptions, and whether the checker is native or delegated to a runtime;
- packer, anti-debug, self-modifying, JIT, or runtime-unpacking indicators.

Use static identification and strings first. Do not execute an unknown artifact merely to learn its type.

## Platform Routing

| Evidence | Route | First narrow action |
| --- | --- | --- |
| ELF / PE native | native checker references | locate entrypoint, imports, validation strings, and compare boundary |
| .NET / Java / Android | managed/mobile references | map assemblies/classes, manifest, resources, JNI/reflection bridge |
| WASM | `wasm-rev.md` | list exports/imports, memory, start function, and host callbacks |
| Python/JS/VM bytecode | bytecode/VM references | identify version, loader, opcode/dispatch, and serialized constants |
| firmware / unusual loader | forensics or emulation handoff | preserve image and identify boot/runtime boundary before emulation |
| packed / runtime-generated | anti-analysis or unpack trace | find stable runtime marker and dump/replay boundary |

Architecture recognition is not enough: lock the toolchain/container/emulator version and record whether the observed behavior is native, replayed, or modeled.

## Static vs Dynamic Decision

Prefer static-first when the validation path, constants, and input constraints are visible. Use dynamic tracing only for a specific unanswered question such as runtime-unpacked code, a native bridge, JIT-generated logic, anti-analysis, or an unavailable library. Before dynamic work define one observation, one stop condition, and one rollback-safe artifact path.

For emulation or replay, compare at least one known input/output and relevant exit/compare state with the native artifact. A successful replay or generated helper is not checker equivalence. Record substrate, architecture/mode, tool version, image digest/fingerprint, and artifact hashes.

## Handoff Map

- Memory corruption, loader abuse, or exploit primitive dominates: hand off to `ctf-pwn`.
- Artifact preservation, firmware carving, or PCAP/document evidence dominates: hand off to `ctf-forensics`.
- Protocol/state-machine behavior dominates: hand off to `ctf-misc` or `ctf-web`.
- Mathematical inversion dominates: hand off to `ctf-crypto`.

## Evidence and Flag Boundary

Maintain an artifact/runtime ledger: source path and hash, platform facts, toolchain, observation IDs, code address/function, input, output, and native/replay comparison. Apply `ctf-common/references/flag-identification-rules.md`; a string in `.rodata`, a decompiler comment, or a satisfiable model is only `untrusted_hint`/`flag_candidate` until the original checker or an independent oracle accepts it. Write `agent_flag.txt` only after oracle verification.

## Stop Rules

Stop when architecture/loader assumptions conflict, the runtime is unavailable, replay differs from native behavior, or the only route is blind fuzzing/decompilation without a validation boundary.
