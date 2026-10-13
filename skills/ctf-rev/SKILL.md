---
name: ctf-rev
description: Use for authorized reverse engineering CTF challenges involving binaries, APKs, crackmes, obfuscation, anti-debugging, VM logic, decompilation, symbolic reasoning, or dynamic instrumentation.
compatibility: opencode
---

# CTF Reverse Engineering

## Purpose

Use this skill to recover validation logic, secrets, encodings, algorithms, or flags from compiled programs and mobile apps.

## Contract


## Skill Layer Contract


## Load When

Load when an executable, APK, DEX/JVM/WASM/Python bytecode artifact, checker, obfuscation layer, or runtime validation path is the dominant evidence.

## Do Not Load When

Do not use REV as a generic binary/artifact bucket when the decisive weakness is Web, PWN, Crypto, Forensics, or Misc protocol behavior.

## Required Inputs

Require the artifact and provenance, format/architecture/runtime, checker or transform evidence, available lab/tool capabilities, and current evidence state.

## First Safe Action

Run the narrow REV analyzer/fingerprint path, preserve the selected runtime substrate, and record one concrete validation discriminator before broad decompilation.
### Firmware / Intel HEX convergence rule

When the artifact is Intel HEX or AVR firmware, do not begin with repeated full-image disassembly. First write one bounded workspace-local parser that validates record checksums, reconstructs address gaps, and reports the non-empty spans. Then search for repeated output/helper-call instruction motifs and recover the smallest emitted symbol stream (bits, nibbles, bytes, or timing units). Try only evidence-backed stride, polarity, and bit-order variants, score printable/flag-shaped outputs, and independently re-run the winning transform in `solve.py`. If a verified candidate appears, immediately write the exact flag plus a newline to `agent_flag.txt` and stop; do not continue exploratory probes.

## Dispatch / Handoff

Dispatch to the smallest format/runtime/packing reference. Return a verified transform/checker constraint or a falsified route to `ctf-decision-engine`; enter `ctf-closure-gate` only after an oracle-backed primitive or final validation path exists.

This orchestrator owns REV phase dispatch and runtime evidence. Follow the shared layer/hand-off rules in `skills/SKILL_CONTRACT.md`; keep packed/runtime-specific procedures in the smallest matching reference.

- Load `references/REFERENCE_INDEX.md` first when multiple reverse subfamilies compete.
- If architecture, loader, ABI, runtime, or native-versus-replay substrate is unclear, load `references/runtime-platform-triage.md` before selecting tools.
- Use `ctf-terminal` for command, debugger, emulator, Frida, or adb interactions.
- Runtime evidence is two-way: every observation artifact reference must resolve to one intact artifact, and every non-planned artifact should be linked by an observation or evidence reference; use `inspect-provenance` to audit this without making planned artifacts fatal.
- Artifact records carry a generation. For artifact-backed observations, preserve `artifact_generations` and `artifact_sha256s`; same-path replacement or content drift must invalidate the old observation rather than silently reusing it.
- For replay semantics, prefer `registers_sha256`, `memory_sha256`, and `trace_sha256` in native/replay/comparison observations; strict comparison checks these fields for agreement.
- Import runtime doctor output with `record-runtime-fingerprint` and use `verify-runtime-fingerprint` to compare it with the session substrate. These commands never execute the target; `verified` means supplied metadata is internally consistent, not that a challenge was run.
- Prefer the smallest artifact-specific reference before broad decompilation.
- Keep `notes.md` centered on the current bottleneck, extracted checker path, and next discriminator.

For native validation/checker slicing, load `references/native-checker-slice.md`.

For Flutter/Dart AOT snapshots, load `references/flutter-dart-aot.md` and use the `flutter_aot_*` toolchain before manual libapp.so reading.

For microarchitecture, cache-timing, generated circuit, `clflush`/`rdtscp`/`mfence`, or hardware-backed boolean checker evidence, load `references/microarch-generated-circuit.md` immediately.

For XOR, table, byte-wise, lookup, or reversible transform checks, load `references/xor-table-transform.md`.

For arithmetic/bit-vector/branch constraints, load `references/z3-constraint-solver.md`.

For custom VM, bytecode dispatch, opcode handlers, or VMProtect-like interpreters, load `references/custom-vm-lifter.md`.

For clear success/failure addresses with branch-heavy constraints, load `references/angr-symbolic-exec.md`.

For isolated checker emulation, runtime-bound native code, or targeted function rehosting, load `references/unicorn-qiling-emulation.md`.

For anti-debug, anti-VM, timing checks, ptrace, IsDebuggerPresent, or Frida detection, load `references/anti-debug-anti-vm.md`.

For packed, self-modifying, or runtime-unpacked binaries, load `references/packed-unpack-trace.md`.

For Windows PE files that are packed, memory-rebuilt, or have entry code outside `.text` that Ghidra/ReVa recover poorly, load `references/windows-packed-pe-rebuild.md`.

For `.pyc`, PyInstaller, marshal, or Python bytecode artifacts, load `references/python-pyc-pyinstaller.md`.

For `.wasm`, WAT, browser WASM, or linear-memory checkers, load `references/wasm-rev.md`.

For APK JNI/native bridge, reflection, dynamic loading, or targeted Frida hooks, load `references/android-jni-frida.md`.

For .NET/IL, Unity managed assemblies, CLR metadata, or ConfuserEx-like managed obfuscation, load `references/dotnet-il-rev.md`.

For Go/Rust binaries with runtime-heavy noise, `.gopclntab`, panic strings, or mangled runtime symbols, load `references/go-rust-binary-rev.md`.

For AES/TEA/RC4/hash/CRC/SM4 constants or crypto-like round functions, load `references/crypto-constants-recognition.md`.

When choosing between patching and solver extraction, load `references/patch-vs-solve.md`.

## Scope

Use only on provided challenge files, local apps, emulators, or explicitly authorized targets.

## Inputs

Collect:

- File type, architecture, hashes, packaging, symbols, strings, imports, resources, and execution requirements.
- For APKs: manifest, activities, services, assets, native libraries, dynamic loaders, and network endpoints.
- Expected input and flag format.

## Docker Lab Stability Doctrine

For native REV work, treat the prepared Docker lab as the default runtime substrate once artifact shape confirms it is useful:

1. Check readiness first with `ctf-env-check category=rev`; record Docker daemon status, `revlab:ubuntu22.04` image availability, cross-arch/qemu needs, Android/emulator needs, and host-only constraints.
2. Inventory target runtime artifacts: Dockerfile/compose, architecture, packing/runtime dependencies, network behavior, interpreter/VM requirements, and whether the artifact is native, APK/mobile, managed, WASM, or static-only.
3. Prefer challenge Docker/compose when present and runnable. Otherwise choose `revlab:ubuntu22.04` for native ELF/PE reversing, cross-arch emulation, network/artifact tools, unpacking, angr/qiling/unicorn, and scripted solver verification.
4. Lock the chosen substrate (`challenge-docker`, `revlab-docker`, `host`, `android-emulator`, `remote-only`) before dynamic testing or long tool runs. Record image/service, `/work` mount, why it matches the target, and the unlock condition.
5. Keep runtime traces, unpacking, emulation, dynamic checker probes, solver verification, and repeated tool invocations inside the locked container. Do not alternate host/WSL/Docker because one shell command or quote form failed.
6. Switch to host only for GUI-heavy Ghidra workflows, hardware/device/emulator requirements, or cheap static reads already available there. Switch to remote only for final service-specific validation or proven local/remote drift.
7. Before any substrate switch, write: `Switching substrate because: <current substrate blocker>; <new substrate evidence/goal>`.

## Workflow

1. Check Docker lab readiness and lock the runtime substrate before dynamic/runtime-sensitive work.
   - Run `ctf-env-check category=rev` unless fresh equivalent evidence exists.
   - Prefer challenge Docker/compose, otherwise `revlab:ubuntu22.04` for native/cross-arch/tool-heavy work.
   - Record the selected image/service, `/work` mount, and unlock condition.
2. Triage with file type, strings, imports, sections, entropy, and packing indicators.
   - For native ELF/PE artifacts, run `ctf-rev-analyze` first. Use direct `ctf-binary-probe`, `ctf-elf-slice`, or `ctf-rev-pe-slice` only when the facade output needs a narrower fallback.
   - ctf-rev-analyze also fingerprints Mach-O, DEX/classes*.dex, JVM class, WASM, and Python bytecode. Follow its capability and
     extToolHint; these routes intentionally report an external or optional-pack fallback instead of running the native ELF/PE probe.
   - ctf-rev-closure-ladder is in the base
     ev pack. Run it after concrete checker/transform/VM/runtime evidence; preserve its closure ledger and only sync an existing decision state when an oracle-backed probe is available.
   - ctf-rev-live-memory-dump, ctf-rev-unicorn-helper, and ctf-rev-unicorn-replay-builder are
     ev-heavy generators. They produce a controlled dump plan, helper, or replay skeleton and do not execute unknown targets or establish final correctness.
   - For live dump target arguments, use rgvJson as a JSON string array. Legacy whitespace rgv is compatibility-only; never use eval or shell interpolation for untrusted arguments.
   - For APKs, run `ctf-android-analyze` before broad decompilation. Route from its summary to Java checker, native JNI, assets decode, packed/dynamic loader, or runtime confirmation.
   - If an APK has arm64-only native libraries or the expected device profile matters, run `ctf-android-runtime-doctor` before trusting emulator dynamic results.
   - If packed/native APK evidence mentions `extract.dat`, code_item patching, classloader swaps, `libshell.so`, decompiler failures, or `libndk_translation`, run `ctf-android-packed-closure-helper` to pick the shortest next probe.
   - If patch records target `classes.dex` offsets, run `ctf-dex-patch-map` to map offsets to class/method code_item owners before broad apktool browsing.
   - Use `ctf-android-dynamic-macro` for approved adb/logcat/run-as/frida collection after runtime equivalence is understood.
   - If APK native/JNI signals appear, run `ctf-android-native-triage` before broad Java reading.
   - For a Java/Kotlin checker route, read only the reported entry classes and checker method slices (smali plus `javap` on extracted JARs) instead of a full decompile.
   - Flutter/Dart AOT signals (libapp.so + libflutter.so present, Dart snapshot header, Flutter engine strings): run `flutter_aot_triage` first, then `flutter_aot_recover`. Do not attempt manual libapp.so reverse engineering with Ghidra alone.
3. Run strong-signal routing before algorithm guessing:
   - exception/unwind-heavy behavior, suspicious register staging not consumed in normal `.text`, or hints like `patch` / `frame` / `unwind` / `debug` -> inspect `.eh_frame`, `.debug_frame`, `.gcc_except_table`, `DW_CFA_val_expression`, and `DW_OP_*` before declaring the checker absent.
   - `clflush` + `rdtsc/rdtscp`, `mfence/lfence`, `prefetch`, or repeated timing-threshold checks -> enter `MICROARCH_CIRCUIT` and load `references/microarch-generated-circuit.md`.
   - large repeated helper functions with bit extraction/cache-line indexing -> enter `GENERATED_CIRCUIT` and load `references/microarch-generated-circuit.md`.
   - dispatch loops/opcode tables -> enter VM lifter mode before broad decompilation.
   - `.pyc`, PyInstaller, marshal, or Python bytecode -> load `references/python-pyc-pyinstaller.md` before executing extracted code.
   - `.wasm`, `WebAssembly.instantiate`, WASM exports/imports, or linear-memory compare -> load `references/wasm-rev.md`.
   - APK with JNI/native libs/reflection/assets -> load `references/android-jni-frida.md`; map the bridge before Frida.
   - .NET/IL/Unity managed metadata -> load `references/dotnet-il-rev.md` before reading GUI/framework boilerplate.
   - Go/Rust runtime-heavy binary -> load `references/go-rust-binary-rev.md` and filter runtime noise via strings/xrefs.
   - packed/self-modifying/runtime-unpacked clues -> load `references/packed-unpack-trace.md` before long static review.
   - Windows PE with renamed packer sections, memory-only code, or a rebuilt image with too few functions -> load `references/windows-packed-pe-rebuild.md` before broad decompilation.
   - anti-debug/anti-VM/timing/pseudo-environment barriers -> load `references/anti-debug-anti-vm.md` and separate bypass from checker semantics.
   - crypto constants, S-boxes, block rounds, hash tables, or TEA/AES/RC4/SM4 clues -> load `references/crypto-constants-recognition.md` for one focused primitive recognition pass.
   - known success/failure addresses plus branch-heavy bounded input -> consider `references/angr-symbolic-exec.md`.
   - isolated checker function with hard runtime dependencies -> consider `references/unicorn-qiling-emulation.md`.
4. If platform or runtime identity remains uncertain, load `references/runtime-platform-triage.md` and lock the toolchain before deep analysis.
5. Locate entry points and validation paths.
5. Find comparisons, transforms, constants, encoders, crypto loops, and error messages.
6. Rename important functions and variables in notes or decompiler when possible.
7. Extract logic into `solve.py` rather than patching blindly.
8. Use dynamic analysis only to confirm static hypotheses or handle anti-analysis/VM/hardware-runtime barriers.
9. For mobile, inspect Java/Kotlin, native libraries, assets, reflection, dynamic loading, and network behavior.
10. Verify recovered input or flag against the program/app when possible.

Pick the first branch supported by artifact evidence. If a branch fails, record why before switching.

## When to Pivot

- If the artifact is really memory corruption or runtime exploitation after checker recovery, hand off to `ctf-pwn`.
- If the artifact is actually an evidence container / disk / pcap / document workflow, hand off to `ctf-forensics`.
- If the branch is mostly protocol, puzzle, or mixed transform logic after classification, hand off to `ctf-misc`.
- If the core problem is mathematical cryptanalysis rather than executable validation, hand off to `ctf-crypto`.

## Scoreboard Speed Lane

For easy/medium reverse challenges or the first 8-12 minutes of a fresh artifact, prioritize the shortest validation path:

1. Run `ctf-rev-analyze` or artifact-specific triage once unless fresh equivalent evidence already exists.
   - If the route depends on external tooling or an optional pack, run `ctf-rev-capability-check family=<family>` first; use its `status`, `blocking`, `fallbacks`, and `recommended_path` rather than static availability assumptions.
2. Search success/failure strings, flag fragments, usage text, input prompts, and suspicious constants.
3. Use xrefs from success/failure strings to locate the nearest checker before broad decompilation.
4. Extract input length checks, charset constraints, constants, byte arrays, lookup tables, and simple XOR/add/sub/rotate/base encodings.
5. Prefer a small `solve.py` that inverts or emulates the checker over manual reasoning through long pseudocode.
6. For APK/JAR/.NET/pyc/WASM/Flutter AOT, inspect manifest/entrypoints/string references/assets/Blutter output before full decompilation or dynamic instrumentation.
7. For packed or obfuscated binaries, first test common packer clues, runtime strings, and validation boundary; do not spend long on full unpacking before proving where the check lives.
8. Return early once a candidate input/flag is verified by the binary/app or exact checker logic.

## Hard-Rev Doctrine

Once a reverse target is clearly medium/hard, explicitly enter `HARD_REV` and state the current bottleneck before reading more pseudocode.

If `MICROARCH_CIRCUIT` or `GENERATED_CIRCUIT` is active, the immediate bottleneck is `PROGRAM_MODEL_EXTRACTION` until touch/flush/measure or gate primitives are modeled and validated.

`HARD_REV` bottleneck families:

- `PROGRAM_MODEL_EXTRACTION`: the real input boundary, checker, primitive model, or state machine is not yet isolated.
- `MICROARCH_PRIMITIVE_MODEL`: cache/timing/hardware primitives exist but touch/flush/measure semantics, thresholds, and software-emulation patch are not validated.
- `GENERATED_CIRCUIT_EXTRACTION`: repeated helper/generated code exists but callsite patterns, bit reads, gate order, and output packing are not extracted.
- `CHECKER_PATH_PRIORITY`: too many candidate checks exist and the nearest decisive path is unclear.
- `VM_LIFTER_REDUCTION`: VM/bytecode/dispatcher structure exists but the handler model is not reduced enough.
- `SYMBOLIC_EXECUTION_TARGETING`: angr/concolic execution is tempting, but find/avoid/input bounds/stubs are not precise enough.
- `EMULATION_REHOSTING`: isolated checker is known, but calling convention, memory map, or oracle is not validated.
- `BYTECODE_RUNTIME_EXTRACTION`: pyc/WASM/.NET/JVM bytecode exists, but entrypoint/resources/constants are not mapped.
- `MOBILE_BRIDGE_MAPPING`: APK/mobile code exists, but Java/Kotlin/native/assets/reflection bridge is not mapped.
- `PACKER_RUNTIME_BOUNDARY`: static view is packed or misleading, and post-unpack checker boundary is not dumped/traced.
- `SYMBOLIC_MANUAL_SPLIT`: unclear whether to keep manual inversion, emulate, or escalate to Z3/symbolic tooling.
- `SEMANTIC_VERIFICATION`: decompiler output exists, but widths/signedness/loop bounds/endianness are still unverified.
- `PATCH_VS_SOLVE`: patching looks tempting, but the shortest reproducible solve path is not justified yet.
- `MANAGED_RUNTIME_NOISE`: .NET/Go/Rust/Unity/runtime boilerplate obscures the real checker and string/resource xrefs are not prioritized.
- `CRYPTO_PRIMITIVE_RECOGNITION`: code looks crypto-like, but constants/rounds/mode/key source/compare point are not proven.
- `HIDDEN_SEMANTIC_CARRIER`: visible `.text` is too weak for the observed staged data, and unwind/debug/init/fini/TLS or detached metadata-linked consumers are not yet ruled out.

For each hard branch, record:

- current bottleneck family
- one next discriminator
- one kill condition
- one closure path if the branch succeeds

Hard rules:

- If `clflush` plus `rdtsc/rdtscp` appears in the validation path, stop standard cipher guessing after at most one quick constants test; model the hardware primitive first.
- Do not keep reading long decompiler output while `PROGRAM_MODEL_EXTRACTION`, `MICROARCH_PRIMITIVE_MODEL`, `GENERATED_CIRCUIT_EXTRACTION`, or `HIDDEN_SEMANTIC_CARRIER` is unresolved.
- Do not use more than calibration oracle sampling (2-5 samples, or up to 128 for a single affine/linearity test) after block/linear hypotheses fail; pivot to primitive extraction/software emulation.
- Do not escalate to symbolic solving while `SEMANTIC_VERIFICATION` is still weak.
- Do not patch simply because validation is annoying; justify why patching is better than extracting a solver. For microarchitecture challenges, software-emulating touch/measure primitives is a model-building step, not a blind bypass, but it must be validated against real oracle samples.
- If VM evidence exists, isolate dispatch/opcode/handler shape before full deobfuscation.
- If .NET/Go/Rust runtime noise exists, jump from strings/resources/panic messages/xrefs to user checker before reading framework boilerplate.
- If crypto-like constants appear, perform one focused primitive-recognition pass, then either use a known inverse route or return to generic checker slicing.
- If patching is considered, load `references/patch-vs-solve.md` and record whether the patch reveals state or only fakes success.
- If symbolic execution evidence exists, locate find/avoid addresses and input bounds before launching broad angr exploration.
- If emulation evidence exists, validate one concrete input/output against native behavior before trusting the emulator.
- If mobile/JNI evidence exists, map manifest/activity/assets/native bridge before blind Frida hooks.
- If bytecode evidence exists, inspect entrypoint/constants/resources before full decompilation or execution.
- If visible `.text` does not explain staged register data, exception routing, or challenge hints like `patch` / `frame`, run one hidden-semantic pass before concluding the checker is gone.

## Rev Constraint Equation

Before a non-trivial branch, summarize the reversing equation:

| Input Boundary | Check Function | Constants / Tables | Transform Chain | Comparison Oracle | Inversion Strategy | Verification |
| -------------- | -------------- | ------------------ | --------------- | ----------------- | ------------------ | ------------ |

Use the table to force every probe to improve reachability, exact semantics, constraint extraction, inversion, or verification.

## Rev Hard Brakes

- After 2 decompiler-reading passes without locating validation, pivot to xrefs from success/failure strings, imports, dynamic trace, or format-specific tooling.
- Do not manually solve long pseudocode before extracting constants and writing an executable checker or solver.
- Treat decompiler output as a hypothesis until signedness, byte order, integer width, loop bounds, and truncation are verified.
- For mobile, do not start Frida/adb work until static Java/Kotlin/native/assets evidence identifies a target method or runtime-only barrier.
- For VM/obfuscation, identify dispatch, opcode table, handlers, and trace oracle before attempting full deobfuscation.
- For hidden-semantics candidates, do not conclude 閳ユ笓ogic removed閳?until metadata/unwind/init-fini/TLS consumers are ruled out.

## Fallback Matrix

When a reverse probe stalls, load `references/rev-fallback-matrix.md` and choose one fallback by failed stage: artifact triage, validation discovery, constants extraction, semantics verification, solver construction, anti-analysis, mobile/native bridge, VM/obfuscation, hidden-semantic carrier, or final verification.

## Reference Dispatch

- `microarch-generated-circuit.md`: `clflush`, `rdtsc/rdtscp`, `mfence/lfence`, cache hit/miss timing, hardware-backed boolean circuits, repeated generated helper functions, or software-emulated timing primitives.
- `native-checker-slice.md`: native binary, prompt/success/failure strings, compare/check function, crackme validation.
- `flutter-dart-aot.md`: Flutter/Dart AOT snapshot recovery, Blutter output triage, app asm filtering, object-pool clue extraction, and Frida template bootstrapping.
- `xor-table-transform.md`: byte arrays, XOR/add/sub/rotate, lookup tables, S-boxes, custom encodings.
- `z3-constraint-solver.md`: many arithmetic/bit-vector constraints, branch predicates, rolling checks, charset/length equations.
- `custom-vm-lifter.md`: dispatcher loops, bytecode blobs, opcode handlers, VM registers/state, VMProtect-like interpreters.
- `angr-symbolic-exec.md`: known success/failure addresses, bounded symbolic input, branch-heavy constraints.
- `unicorn-qiling-emulation.md`: isolated checker rehosting, runtime-bound native code, targeted compare/output hooks.
- `anti-debug-anti-vm.md`: ptrace, IsDebuggerPresent, timing, CPUID, Frida detection, emulator checks.
- `packed-unpack-trace.md`: packed/self-modifying/runtime-unpacked binaries, high entropy sections, tiny imports.
- `windows-packed-pe-rebuild.md`: Windows PE runtime dump/rebuild, `.pdata` function recovery, memory strings, Ghidra/ReVa function recovery, cdb/x64dbg automation.
- `python-pyc-pyinstaller.md`: `.pyc`, PyInstaller, marshal blobs, Python bytecode validators.
- `wasm-rev.md`: `.wasm`, WAT, WebAssembly exports/imports, linear-memory validation.
- `android-jni-frida.md`: APK JNI/native bridge, reflection, dynamic loading, targeted Frida hooks.
- `dotnet-il-rev.md`: .NET assemblies, Unity managed code, IL metadata/resources, managed obfuscation.
- `go-rust-binary-rev.md`: Go/Rust runtime-heavy binaries, `.gopclntab`, panic strings, mangled symbols.
- `crypto-constants-recognition.md`: AES/TEA/RC4/hash/CRC/SM4 constants, round functions, key schedule clues.
- `patch-vs-solve.md`: deciding whether to patch anti-analysis/expose state or extract a reproducible solver.
- `rev-fallback-matrix.md`: checker discovery, constants extraction, semantics, solver, anti-analysis, mobile, VM, hidden semantic carriers, or verification stalls.
- Hidden-semantics / unwind-metadata route: exception-heavy binaries, weak visible checker, suspicious staged register data, or hints like `patch` / `frame` / `unwind`; inspect `.eh_frame`, `.debug_frame`, `.gcc_except_table`, `DW_CFA_val_expression`, and `DW_OP_*`.

## Validation Discovery Tree

Look for these in order:

1. Success and failure strings.
2. Flag format literals or partial flag fragments.
3. Input length checks and character constraints.
4. `strcmp`, `strncmp`, `memcmp`, hashing, crypto, or custom compare loops.
5. Hardware/runtime primitives in the validation path: `clflush`, `rdtsc/rdtscp`, `mfence/lfence`, timing thresholds, repeated cache-line touches. If present, switch to `MICROARCH_CIRCUIT` before further algorithm guessing.
6. Lookup tables, constants, S-boxes, and encoded byte arrays.
7. Encoders, decoders, compression, base conversion, and XOR loops.
8. Anti-debug, anti-VM, timing, exception, or self-modifying code.
   8.5 Hidden semantic carriers in native binaries:
   - `.eh_frame`, `.debug_frame`, `.gcc_except_table`
   - `DW_CFA_val_expression`, `DW_OP_*`
   - init/fini arrays
   - relocation-driven constants
   - loader/TLS-driven state
   - debug/unwind metadata when visible `.text` checker looks too weak
     8.6 Windows PE with renamed packer sections or memory-only code: run `ctf-runtime-dump`/`ctf-pe-unpack`, then `ctf-memstr` and `ctf-rev-pe-recovery` before broad decompilation.
9. License/key verification and serial generation logic.
10. JNI/native calls, dynamic loading, reflection, and asset decryption in APKs.
11. Managed/native runtime noise: Go `.gopclntab`, Rust panic/mangled symbols, .NET/IL metadata, Unity assemblies.
12. Bytecode/runtime formats: `.pyc`, PyInstaller, WASM, .NET/IL, JVM class/JAR, Lua, or custom resource bytecode.
13. Network or file dependencies that feed validation state.
14. Flutter/Dart AOT artifacts: libapp.so + libflutter.so in APK lib/arm64-v8a, Dart snapshot header, Flutter engine version string. Use `flutter_aot_triage` -> `flutter_aot_recover` -> search asm/ for checker patterns.

## Pattern Search Discipline

For local pattern recall, query `ctf_rag` with evidence-shaped terms such as `custom vm opcode dispatcher`, `angr find avoid`, `pyinstaller pyc marshal`, `wasm linear memory`, `android JNI RegisterNatives`, `dotnet IL resources`, `go gopclntab string xref`, `rust panic validation`, `crypto constants TEA AES`, `anti debug ptrace timing`, `packed runtime dump`, `windows memory dump pe rebuild`, `RUNTIME_FUNCTION pdata function recovery`, `ghidra pdata function seeds`, or `eh_frame dwarf unwind hidden consumer`, and keep only the hits that change the first safe check before deepening the branch.

If static analysis stalls, use dynamic analysis to confirm one specific hypothesis at a time.

## Tool Discipline

- Prefer static analysis first.
- For Android, prefer manifest/dex/native/assets high-signal triage over full decompilation. Avoid a cold full decompile when `aapt`/zip/dex strings can choose the route.
- For arm64-only native APKs, treat x86_64 emulator success/failure as non-equivalent until `ctf-android-runtime-doctor` says otherwise.
- For DEX hot-patch shelling, resolve patch ownership first with `ctf-dex-patch-map`; decompile only the owner methods and patch writer boundary.
- For dynamic Android work, use the macro flow to collect device props, focused logcat, `run-as` listing, tombstone hints, and Frida attach suggestions instead of hand-assembling adb commands.
- Page long generated artifacts with `ctf-artifact-page`; do not dump full apktool/native strings output into the transcript.
- Use decompilers for structure and disassembly for exact semantics.
- For Windows packed PE, run `ctf-pe-unpack`/`ctf-runtime-dump` to rebuild from memory before long static analysis; then use `ctf-memstr` for ASCII/UTF-16 strings and `ctf-rev-pe-recovery` for `.pdata` function seeds and batched linear disassembly.
- When a pure memory rebuild gives poor ReVa/Ghidra function recovery, run `ctf-pe-hybrid-rebuild` to keep original imports/resources and replace runtime-unpacked executable sections.
- For unstable Windows console checkers, use `ctf-windows-expect-runner` instead of Python `subprocess` for stdin/file input, timeout kill, and output capture.
- For a rebuilt PE, analyse it in Ghidra/ReVa or with bounded `objdump` ranges, and use `ctf-windows-debug-helper` for cdb/WinDbg automation.
- Avoid running unknown binaries outside a controlled environment.
- Treat generated live-dump and Unicorn files as reviewable artifacts: run them only inside the locked substrate, record the exact arch/mode and payload provenance, and validate a concrete input/output before trusting the replay.
- Do not over-trust decompiler output; verify arithmetic, signedness, and pointer behavior.
- If normal `.text` control flow does not explain visible register staging, exception routing, or title hints like `patch` / `frame`, inspect unwind/debug metadata before declaring the checker removed.
- Record function names, addresses, constants, algorithm summaries, and hidden-semantic observations in `notes.md`.

## Primitive Ladder v5

Advance one proven stage at a time:

1. Identify the input or flag validation boundary.
2. Locate the comparison/check function.
3. Extract constants, tables, transforms, and constraints.
4. Invert transforms or solve constraints in `solve.py`.
5. Verify the candidate against the binary or app.

Prefer extracting executable checker logic into a solver over manual reasoning through long decompiler output. Treat decompiler output as a hypothesis until signedness, byte order, loop bounds, arithmetic, and hidden semantic carriers are verified.

## Evidence Requirements

Reverse conclusions require:

- Code path or address evidence.
- Extracted transform or comparison logic.
- Reconstructed input generation.
- Verification by running the binary/app or matching exact comparison logic.

## Output Contract

Produce `solve.py` when practical. Include extracted constants and algorithm steps. Write `agent_flag.txt` only after verification.

## Flag Handling

Use `ctf-common/references/flag-identification-rules.md` for every recovered string. Keep `untrusted_hint`, `flag_candidate`, and `oracle-verified` separate. Strict `prefix{payload}` candidates are not final success by themselves; bare MD5/SHA-256 values require explicit flag-file or flag-helper context. Preserve `source`, `origin`, and `context`, and write `agent_flag.txt` only after an independent exact/file/service oracle verifies the value.
## Stop Conditions

Ask or stop when execution requires unsafe privileges, malware-like behavior is suspected outside a sandbox, dynamic instrumentation needs a device/emulator not available, or packed code cannot be unpacked with available tools.

## Unified Runtime Session

For packed, self-modifying, runtime-generated, or isolated-checker branches, use one workspace-relative `rev_runtime_session.v1` session instead of scattering runtime facts across ad-hoc notes:

```text
ctf-rev-analyze
  -> ctf-rev-capability-check
  -> ctf-rev-runtime-session init
  -> ctf-rev-live-memory-dump / ctf-rev-unicorn-replay-builder
  -> ctf-rev-runtime-session record-marker / record-observation
  -> ctf-rev-runtime-session inspect-artifacts
  -> ctf-rev-runtime-session verify-history
  -> ctf-rev-closure-ladder
  -> ctf-rev-runtime-session set-oracle (link observation IDs)
  -> ctf-rev-runtime-session set-stage through the runtime ladder
  -> ctf-rev-runtime-session sync
```

- `ctf-rev-runtime-session` is a state/evidence manager; it never executes the target.
- `verify-history` is read-only. New events carry a SHA-256 `event_hash` chained through `previous_hash`; `verified` means the chain matches the stored events, `invalid` means tampering/reordering is detected, and hashless legacy history is reported as `legacy` rather than upgraded silently.
- `ctf-rev-live-memory-dump` and `ctf-rev-unicorn-replay-builder` generate reviewable helpers/artifacts only. Successful script generation or replay execution does not establish checker equivalence.
- Keep `sessionPath` identical across tools and store artifact paths relative to the workspace. Record exact substrate, arch/mode, payload provenance, stable marker, compare/check PC when known, and the native-vs-replay oracle.
- Use `record-observation` for imported runtime results; the session tool does not execute targets. Use `inspect-artifacts` to refresh size/SHA-256 and treat `stale`/`missing` as integrity failures requiring review; either state blocks promotion until repaired or re-recorded.
- If `oracle.observation_ids` is supplied, every ID must resolve to a passing observation; failed/unresolved observations and unknown or stale/missing artifact references reject the oracle contract. Duplicate IDs are normalized away. A `comparison` observation may opt into `related_observation_ids`; when present, the links must resolve to native + replay observations with compatible input hashes, architectures, and modes. Record runtime metadata (substrate, arch/mode, tool/version, image digest, and a stable fingerprint) when available; session arch/mode drift is rejected. A legacy oracle without observation IDs remains readable for compatibility, but new runtime branches should link observations. Use `observationContract=strict` for new high-confidence branches; strict passing oracles must directly link passing `native`, `replay`, and `comparison` observations. `linked` validates IDs when supplied while retaining legacy omission behavior. A passing strict comparison must include at least one semantic result field and rejects conflicting input/payload/output digests, exit codes, or stop PCs across linked observations.
- Stage changes should follow the runtime ladder; arbitrary jumps are rejected. The compatibility path permits a direct promotion only when a passing oracle is already present; do not treat helper generation as capture or replay.
- Promotion to `oracle_verified` or `closed` is intentionally rejected until `oracle.status=pass`, non-empty independent evidence, and the linked observation context are recorded.
- Sync to decision state/evidence board only after checking that the projection remains `in_progress` when no oracle exists; do not turn a generated plan into a confirmed finding.
