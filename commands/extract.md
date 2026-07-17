---
description: Daily utility: Safely list and extract archives into workspace-local extracted/<name> in non-CTF mode
agent: daily
subtask: true
---

Use `archive-safe-extract` for normal development archive extraction.

Archive target:
$ARGUMENTS

Rules:

- Prefer `archive-safe-extract` over manual `tar`/`unzip`/Explorer extraction.
- It lists members first, blocks absolute paths and `..` traversal, extracts into `extracted/<archive-name>/`, and summarizes extracted files.
- It supports zip-like archives including `.zip`, `.jar`, `.war`, `.apk`, `.docx`, `.xlsx`, `.pptx` with Windows-native PowerShell fallback when `unzip`/`7z` are unavailable.
- Use `overwrite=false` by default. Ask before overwriting existing extracted output.
- This is for daily engineering archive handling, not CTF solving.

Typical call:

```text
archive-safe-extract target=<path> out=extracted maxFiles=500 overwrite=false
```
