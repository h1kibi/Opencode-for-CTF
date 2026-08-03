---
description: Start a structured reverse engineering CTF solve
agent: ctf-rev
subtask: false
---

Use `ctf-common`, `ctf-terminal`, and `ctf-rev` skills.

Open `skills/ctf-rev/references/REFERENCE_INDEX.md` first when multiple reverse artifact families or bottlenecks compete.

Challenge/target:
$ARGUMENTS

Rules:

- Work only on provided CTF/lab/local artifacts.
- Create or update `notes.md`.
- Prefer static analysis before dynamic instrumentation.
- For native ELF/PE artifacts, start with `ctf-rev-analyze`; use direct binary/slice tools only as focused fallbacks.
- ctf-rev-analyze also fingerprints Mach-O, DEX, JVM class, WASM, and Python bytecode; follow its capability/
- For Mach-O/DEX/APK/WASM/PYC/Unicorn targets, use `ctf-rev-capability-check family=<family>` before external tools; it reports real availability and pack state without executing the target.
  extToolHint instead of forcing an ELF/PE probe.
- ctf-rev-closure-ladder is base
  ev; use it after concrete checker/transform evidence and keep its ledger/decision-state evidence synchronized.
- ctf-rev-live-memory-dump, ctf-rev-unicorn-helper, and ctf-rev-unicorn-replay-builder require
  ev-heavy; they generate controlled helpers/replay skeletons and are not automatic executors.
- For live dump targets, pass arguments through rgvJson as a JSON string array; never use eval or embed untrusted shell fragments.
- For APKs, start with `ctf-android-analyze` when the android pack is enabled; reserve direct JADX/native/runtime tools for the selected route.
- Route by artifact family first: native checker, VM, packed/runtime-unpacked, Flutter, Android/JNI, WASM, Python bytecode, .NET, Go/Rust, crypto-like constants, or hardware-backed checker.
- Extract validation logic into a reproducible solver.
- Verify recovered input or flag against program behavior when possible.
- If a branch stalls, use the family reference index and `references/rev-fallback-matrix.md` before opening another long decompiler pass.
- Pivot early to `ctf-pwn`, `ctf-forensics`, `ctf-misc`, or `ctf-crypto` once the dominant evidence leaves reverse engineering proper.
- Write only the verified final flag to `agent_flag.txt`.

## Runtime-backed Rev workflow

When static analysis identifies packing, self-unpacking, runtime-generated code, or a checker that is easier to rehost:

```text
ctf-rev-analyze
  -> ctf-rev-capability-check (when required)
  -> ctf-rev-runtime-session init
  -> ctf-rev-live-memory-dump / ctf-rev-unicorn-replay-builder
  -> ctf-rev-runtime-session record-marker / record-observation
  -> ctf-rev-runtime-session inspect-artifacts
  -> ctf-rev-runtime-session record-runtime-fingerprint / verify-runtime-fingerprint
  -> ctf-rev-runtime-session inspect-provenance
  -> ctf-rev-runtime-session verify-history
  -> ctf-rev-closure-ladder
  -> ctf-rev-runtime-session set-oracle / set-stage
  -> ctf-rev-runtime-session sync
```

Use one workspace-relative `sessionPath` throughout. The session records artifacts, markers, runtime observations, substrate metadata, closure references, and oracle state. `ctf-rev-runtime-session` only maintains state; it never runs the binary. Use `record-observation` to import native/replay/comparison results and `inspect-artifacts` to record size/SHA-256; changed files become `stale` and deleted files become `missing`; either state blocks promotion until repaired or re-recorded. If `oracle.observation_ids` is supplied, every reference must resolve to a passing observation; failed/unresolved observations and unknown or stale/missing artifact references reject the oracle contract, while duplicate IDs are normalized away. A `comparison` observation can declare `related_observation_ids` for its native/replay inputs; those links must resolve to both kinds and reject input-hash or architecture/mode drift. Record runtime metadata (substrate, arch/mode, tool/version, image digest, and stable fingerprint) when available. A legacy oracle without observation IDs remains readable for compatibility, but new runtime branches should link observations. Use `observationContract=strict` for new high-confidence runtime branches; a passing strict oracle must directly link passing `native`, `replay`, and `comparison` observations. `linked` validates IDs when supplied but retains legacy omission behavior. Follow the stage ladder instead of arbitrary jumps; the compatibility direct-promotion path still requires an already-recorded passing oracle. Do not promote to `oracle_verified` or `closed` without an independent passing oracle with written evidence and linked observation context. Generated dump/replay helpers must be reviewed and run only in the locked authorized substrate. Run `verify-history` before strict promotion: a new session must report a valid `previous_hash`/`event_hash` chain; a legacy hashless history remains readable but is explicitly unverified. Artifact records carry a generation; observations that depend on artifacts should capture `artifact_generations` and `artifact_sha256s`, so replacing a same-path payload cannot silently reuse old evidence. Strict comparisons must include a machine-checkable semantic result and reject output/payload/register/memory/trace digest, exit-code, or stop-PC drift.
