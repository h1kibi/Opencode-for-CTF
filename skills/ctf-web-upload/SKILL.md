---
name: ctf-web-upload
description: Use for authorized Web CTF upload challenges involving file type validation, image parsing, extension bypass, polyglots, path traversal in filenames, archive extraction, or webshell-style execution.
compatibility: opencode
---

# CTF Web Upload

## Purpose

Use when users can upload files or archives. Identify validation layers, storage paths, processing steps, and the least invasive exploit path.

## Signals

- Upload forms, multipart endpoints, avatar/image/document importers, archive import, SVG/XML/image processing, or filename handling.
- Source checks for extension, MIME type, magic bytes, dimensions, image libraries, antivirus hooks, or extraction.

## Workflow

1. Map upload endpoint, accepted fields, auth needs, size limits, and storage/retrieval path.
2. Determine validation order: extension, MIME, magic bytes, parsing, transcoding, renaming, and execution policy.
3. Test benign files first and record where they appear.
4. Choose bypass based on evidence: double extension, case variation, MIME mismatch, magic-byte polyglot, SVG/XML processing, filename traversal, archive slip, or parser confusion.
5. Verify impact: source disclosure, stored XSS, SSRF/XXE through SVG/XML, file overwrite, or code execution only if challenge requires it.
6. Write a reproducible upload and retrieval script.

## File Write Matrix

When an upload/editor/import endpoint can write server-side files, build a write matrix before guessing exploit paths.

Track this in `notes.md`:

| Path | Exists | Writable | Create New | Overwrite Existing | Reloaded/Imported/Served | Risk | Result |
|---|---|---|---|---|---|---:|---|
| package `__init__.py` | yes/no | yes/no | yes/no | yes/no | yes/no | medium | |
| template file | yes/no | yes/no | yes/no | yes/no | yes/no | medium | |
| static file | yes/no | yes/no | yes/no | yes/no | yes/no | medium | |
| view/controller file | yes/no | yes/no | yes/no | yes/no | yes/no | high | |
| config/settings file | yes/no | yes/no | yes/no | yes/no | yes/no | high | |
| log/debug-visible file | yes/no | yes/no | yes/no | yes/no | yes/no | medium | |

Rules:

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

## Bypass Checklist

Check only layers supported by source or observed behavior:

- Extension allowlist and denylist order.
- Case variation and trailing dots/spaces.
- Double extensions and server parsing rules.
- MIME type vs magic bytes.
- Image parser transformations and metadata stripping.
- SVG/XML parser behavior and external entity handling.
- Archive extraction paths and zip slip.
- Filename normalization and path separators.
- Storage path predictability and retrieval controls.
- Execution policy for uploaded extensions.

## Evidence Requirements

- Upload request and server response.
- Validation behavior or source path.
- Storage/retrieval location.
- Minimal payload and verified effect.

## Stop Conditions

Stop when exploitation would upload malware-like code to non-CTF systems, overwrite unrelated files, or require brute-forcing storage names without evidence.
