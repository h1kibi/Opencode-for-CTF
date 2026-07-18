# Forensics Reference Index

Use this file as the top-level trigger map for `skills/ctf-forensics/references/`. Keep the forensics orchestrator thin and dispatch by artifact surface and preservation needs.

## Triage / Preservation

- file inventory, hashes, and safe copy discipline
  - `preservation-and-triage.md`

## Disk / File System

- disk image / volume / file system recovery
  - `disk-and-filesystem.md`

## Memory

- RAM dump / hibernation / injected code / credential extraction
  - `memory.md`

## Network

- PCAP / PCAPNG / traffic reconstruction / covert channels
  - `network.md`

## Stego / Media

- image / audio / video / appended data / spectrogram
  - `stego.md`

## Document / Binary / Archive

- PDF / Office / OLE / firmware / blob / archive extraction
  - `document-and-binary.md`

## Trigger Rules

- If triage identifies a clear artifact surface, load the matching reference before deep extraction.
- If the artifact is mixed or ambiguous, start with preservation and generic triage before selecting a lane.
- If extraction starts to threaten the original artifact, stop and switch to copy-only or non-destructive analysis.
- If a branch is not actually forensics-shaped, hand off to web/rev/crypto/misc with the preserved evidence.

## Maintenance Rule

When adding a new forensics reference, update this index with:

- trigger evidence
- owning artifact surface
- whether it is preservation, extraction, reconstruction, or verification support
