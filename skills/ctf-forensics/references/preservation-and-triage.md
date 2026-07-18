# Forensics Triage & Preservation Reference

Use this reference before deep extraction when a forensics artifact is mixed, unfamiliar, or high-risk to modify.

## Trigger

- Unknown or mixed artifact surface
- Multi-file evidence bundles
- Any case where preservation/provenance is not yet locked

## Primary Route

1. Copy the original artifact.
2. Hash it and record file size and timestamps.
3. Build a small inventory of files, containers, and obvious child artifacts.
4. Decide the primary surface before opening a deep branch.

## Preferred Tools

- `file`
- `strings`
- `binwalk`
- `xxd`
- `exiftool`
- `trID`

## Pivot Rules

- If the artifact is clearly executable validation logic, pivot to rev.
- If it is a transport/client puzzle more than evidence handling, pivot to misc.
- If it is obviously encoded/math-first, pivot to crypto.
