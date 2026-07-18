# Benchmark: Static Before Dynamic

## Goal

Ensure reverse engineering solves start with static triage, artifact-family routing, and checker-path extraction before heavy dynamic instrumentation.

## Expected Behavior

- Record static triage first: file type, strings/imports/sections, or equivalent artifact-first observations.
- Classify the artifact family explicitly (native, APK/JNI, Flutter, WASM, VM, PyInstaller, .NET, Go/Rust, packed, etc.).
- Isolate the checker/validation path before dynamic instrumentation.
- Prefer a reproducible `solve.py` or executable checker extraction once logic is understood.
- If the route stalls, consult the reference index or fallback matrix before opening another long decompiler/dynamic branch.

## Bad Behaviors

- Launches Frida/GDB/emulation before static triage.
- Treats every reverse task as generic broad decompiler work.
- Reads long pseudocode without locating the checker.
- Stops at “I found the comparison” without extracting a solver.
