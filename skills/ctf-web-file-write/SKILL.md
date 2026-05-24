---
name: ctf-web-file-write
description: Use for authorized Web CTF challenges where the agent has confirmed a server-side file write or overwrite primitive. Covers file write matrix construction, create vs overwrite distinction, canary writes, and stable output channel selection.
compatibility: opencode
---

# CTF Web File Write

## Purpose

Use when a server-side file write or overwrite primitive is confirmed. This skill helps select the safest, most stable target file before writing.

## File Write Matrix

Build this before choosing a target:

| Path | Exists | Writable | Create New | Overwrite Existing | Reloaded/Imported/Served | Risk | Result |
|---|---|---|---|---|---|---:|---|

## Rules

- Distinguish arbitrary create from overwrite-only behavior.
- Test low-risk canary writes first.
- Prefer files that already exist.
- Prefer files that are imported, rendered, or served naturally.
- Prefer non-core files before route/controller/config files.
- Before overwrite tests, read or recover the original content when possible.
- Record whether the write is reversible.
- If the original content cannot be recovered, treat the action as high risk.
- Do not overwrite core app files until the final chain is locked.
- If direct HTTP echo is unstable, write output into an existing stable control plane such as a database-backed profile/admin field, log, or rendered page.

## Stable Target Priority

1. Log or debug-visible file (low risk, natural output)
2. Template file that is rendered per request
3. Static file served directly
4. Importable module (`__init__.py`, utility files)
5. View/controller file (high risk, only if reload proven)
6. Config/settings file (highest risk, final step only)
