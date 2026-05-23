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

## Evidence Requirements

- Upload request and server response.
- Validation behavior or source path.
- Storage/retrieval location.
- Minimal payload and verified effect.

## Stop Conditions

Stop when exploitation would upload malware-like code to non-CTF systems, overwrite unrelated files, or require brute-forcing storage names without evidence.
