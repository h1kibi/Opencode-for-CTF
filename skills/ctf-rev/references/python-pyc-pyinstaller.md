# Python PYC / PyInstaller

Use when artifacts are `.pyc`, PyInstaller bundles, marshal blobs, zipped Python packages, or Python bytecode validators.

## Triggers

- `.pyc`, `PYZ`, `pyi-archive`, `__main__.pyc`, `marshal.loads`, `exec`, `eval`.
- Python bytecode with constants, encoded strings, or validation logic.

## First Safe Checks

1. Identify Python version/magic and packaging format.
2. Extract PyInstaller/PYZ or zip members safely.
3. Decompile with version-compatible tools when available; otherwise use `dis` and constants.
4. Locate validation function from strings/constants and call graph.
5. Recreate checker in `solve.py`; avoid executing untrusted extracted code directly.

## Bytecode Ledger

| File | Python Version | Entry | Constants | Validation Function | Next Action |
|---|---|---|---|---|---|

## Stop Rules

- Do not run extracted Python code before reviewing imports and side effects.
- If decompilation is broken, use `dis`, `co_consts`, `co_names`, and bytecode control flow rather than trying random decompilers.
- Verify candidate against reconstructed checker or sandboxed original.
