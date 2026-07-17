---
description: Daily utility: Safely list and extract archives into workspace-local extracted/<name>
agent: ctf-expert
subtask: true
---

Use `ctf-safe-extract` for authorized CTF/lab/archive extraction in the CTF workspace.

Archive target:
$ARGUMENTS

Rules:

- Prefer `ctf-safe-extract` over manual `tar`/`unzip`/Explorer extraction.
- It lists members first, blocks absolute paths and `..` path traversal, extracts into `extracted/<archive-name>/`, and reports suspicious files.
- It supports zip-like archives including `.zip`, `.jar`, `.war`, `.apk`, `.docx`, `.xlsx`, `.pptx` with Windows-native PowerShell fallback when `unzip`/`7z` are unavailable.
- Use `overwrite=false` by default. Ask before overwriting existing extracted output.
- Use this from CTF mode, not non-CTF mode.

Typical call:

```text
ctf-safe-extract target=<path> out=extracted maxFiles=500 overwrite=false
```
