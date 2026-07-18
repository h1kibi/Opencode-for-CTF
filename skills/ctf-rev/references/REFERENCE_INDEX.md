# Rev Reference Index

Use this file as the top-level trigger map for `skills/ctf-rev/references/`. Keep the reverse skill thin and route by artifact family and current bottleneck.

## Native / Checker Extraction

- native checker slicing and compare-path isolation
  - `native-checker-slice.md`

- XOR / tables / reversible transform logic
  - `xor-table-transform.md`

- arithmetic / bit-vector / branch constraints
  - `z3-constraint-solver.md`

## VM / Symbolic / Emulation

- custom VM / bytecode dispatch / handler recovery
  - `custom-vm-lifter.md`

- known find/avoid points and bounded symbolic execution
  - `angr-symbolic-exec.md`

- isolated checker emulation / rehosting
  - `unicorn-qiling-emulation.md`

## Anti-analysis / Runtime Complexity

- anti-debug / anti-VM / timing / instrumentation barriers
  - `anti-debug-anti-vm.md`

- packed / self-modifying / runtime-unpacked binaries
  - `packed-unpack-trace.md`

- patch vs solve decision support
  - `patch-vs-solve.md`

## Specialized Artifact Families

- Flutter / Dart AOT
  - `flutter-dart-aot.md`

- WASM
  - `wasm-rev.md`

- Python bytecode / PyInstaller
  - `python-pyc-pyinstaller.md`

- Android JNI / Frida / reflection
  - `android-jni-frida.md`

- .NET / IL / Unity managed code
  - `dotnet-il-rev.md`

- Go / Rust runtime-heavy binaries
  - `go-rust-binary-rev.md`

- crypto-like constant recognition
  - `crypto-constants-recognition.md`

- microarchitecture / generated circuit / hardware-backed checkers
  - `microarch-generated-circuit.md`

## Fallback / Reclassification

- stalled branch fallback guidance
  - `rev-fallback-matrix.md`

## Trigger Rules

- If the artifact family is obvious, start with the matching reference before broad pseudocode reading.
- If dynamic work is tempting but the checker path is still unclear, stay static-first.
- If the branch stalls, use `rev-fallback-matrix.md` and choose one fallback by failed stage.
- If the challenge is not actually reverse-shaped after triage, hand off to pwn/misc/forensics/crypto.

## Maintenance Rule

When adding a new Rev reference, update this index with:

- trigger evidence
- owning artifact family or bottleneck
- whether it is extraction, fallback, or verification support
