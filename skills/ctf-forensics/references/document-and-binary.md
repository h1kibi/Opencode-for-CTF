# Document & Binary Reference

Use this reference for PDF / Office / OLE / firmware / binary blob / archive-adjacent forensics after triage confirms document or opaque binary surfaces.

## Trigger

- PDF / DOCX / XLSX / ODT / OLE artifacts
- firmware blobs or unknown binary containers
- metadata-heavy or embedded-object clues

## Primary Route

1. Unpack or enumerate embedded objects safely.
2. Inspect metadata, streams, objects, macros, and relationships.
3. Preserve every extracted child artifact under a clear path.
4. Reclassify child artifacts into rev/crypto/misc/forensics lanes as evidence strengthens.

## Preferred Tools

- `oleid`
- `olevba`
- `pdf-parser`
- `binwalk`
- `strings`
- `zipfile` / safe extraction tools

## Pivot Rules

- If the core challenge becomes executable logic, pivot to rev.
- If the key artifact is a reversible transform or protocol, pivot to misc/crypto.
- If the file is mainly an archive, use safe extraction first before deeper forensics branches.
