# .NET / IL Reverse Engineering

Use when artifacts are .NET assemblies, C# crackmes, Unity managed code, ConfuserEx-like obfuscation, or IL-level validation.

## Triggers

- PE imports CLR/.NET runtime, `mscoree.dll`, `BSJB`, `.text` with managed metadata.
- `.dll`, `.exe`, `.resources`, Unity `Assembly-CSharp.dll`, or IL strings.
- C# method names, resources, delegates, reflection, or async/state-machine classes.

## First Safe Checks

1. Identify assembly metadata, entrypoint, resources, and referenced assemblies.
2. Search success/failure strings and xrefs in managed methods.
3. Inspect resources and embedded byte arrays before broad deobfuscation.
4. For obfuscation, find the actual validation method by xrefs/runtime call path.
5. Recreate validation in `solve.py` or a small C#/IL harness; patch only when solver extraction is slower.

## IL Ledger

| Assembly | Method | Role | Constants/Resources | Input | Compare Oracle |
|---|---|---|---|---|---|

## Stop Rules

- Do not read all generated async/GUI/framework code before xrefing success/failure strings.
- Do not trust decompiler output for integer casts, checked/unchecked arithmetic, or string encodings until IL confirms it.
- If strings/resources are decrypted at runtime, hook the decryptor or dump after first call.
