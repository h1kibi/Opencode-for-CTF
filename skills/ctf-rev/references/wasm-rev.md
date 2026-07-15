# WASM Reverse Engineering

Use when artifacts include `.wasm`, `.wat`, browser WASM modules, or linear-memory validation.

## Triggers

- WASM imports/exports, `WebAssembly.instantiate`, `.wasm` binary, Emscripten glue.
- Validation logic in exported function or linear memory comparison.

## First Safe Checks

1. Convert to WAT if tooling exists; otherwise inspect exports/imports/strings.
2. Identify exported validation function and argument/return convention.
3. Locate linear memory constants, tables, and compare loops.
4. Run a small JS/Python harness to call the function with controlled input.
5. Lift transform/constraints into `solve.py` or emulate calls directly.

## WASM Ledger

| Export | Args | Return | Memory Offsets | Constants | Oracle |
|---|---|---|---|---|---|

## Stop Rules

- Do not reverse JS glue before checking WASM exports and memory constants.
- If names are stripped, use string/data xrefs and compare-loop patterns.
- Verify candidate by calling the WASM function or original page harness.
