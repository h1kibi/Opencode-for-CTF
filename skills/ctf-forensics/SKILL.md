---
name: ctf-forensics
description: Use for authorized forensics CTF challenges involving disk images, memory dumps, pcaps, archives, documents, steganography, metadata, logs, malware artifacts, or evidence extraction.
compatibility: opencode
---

# CTF Forensics

## Purpose

Use this skill to preserve artifacts, triage evidence, extract hidden data, and produce reproducible findings.

Use `ctf-terminal` for long-running extraction, volatility, tshark, binwalk, or yara commands.

## Scope

Use only on provided challenge artifacts or explicitly authorized evidence.

## Inputs

Collect:

- Original artifact paths, file sizes, hashes when useful, archive nesting, passwords/hints, timestamps, and expected flag format.
- Artifact type: image, pcap, memory dump, disk image, document, log, binary blob, audio/video, archive, or mixed.

## Workflow

1. Preserve original files; work on copies or extracted outputs.
2. Create `extracted/` for derived files when extraction is needed.
3. Triage with file type, metadata, strings, entropy, headers, and archive listing.
4. For pcaps, inspect protocols, conversations, transferred files, credentials, DNS/HTTP anomalies, and payload reconstruction.
5. For memory, identify profile/symbol needs, processes, network connections, command history, injected code, and dumped files.
6. For documents, inspect metadata, macros, embedded objects, relationships, and compressed XML.
7. For stego, check metadata, appended data, LSB, palette, alpha, QR/barcode, audio spectrogram, and password-protected layers.
8. Record exact extraction commands and summarize findings.

## Tool Discipline

- Do not overwrite original artifacts.
- Prefer read-only inspection before extraction.
- Record output paths and artifact hashes/sizes when relevant.
- Avoid dumping huge binary blobs into notes; summarize offsets and extracted files.

## Evidence Requirements

Forensics findings require:

- Artifact path and extraction method.
- Tool output or file content evidence.
- Reproducible steps.
- Clear distinction between clue, hypothesis, and confirmed flag.

## Output Contract

Keep `notes.md` updated with a chain of custody style log. Produce `solve.py` for deterministic parsing or extraction when practical.

## Stop Conditions

Ask or stop when required passwords are unavailable, extraction would destroy evidence, required tools are missing and no fallback exists, or the only result is an unverified suspicious string.
