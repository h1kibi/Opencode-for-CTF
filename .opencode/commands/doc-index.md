---
description: Prepare local documents for RAG-style indexing
agent: doc-agent
---

Prepare these files or this directory for document indexing:

$ARGUMENTS

Rules:
- Inspect files safely.
- Use `doc-read` with `includeJson=true` whenever useful.
- Preserve source metadata:
  - source path
  - page number for PDFs
  - sheet name for Excel
  - slide number for PowerPoint
  - section/title when available
- Recommend chunking strategy.
- Do not create embeddings unless explicitly asked.
- If writing outputs, write only under `extracted/`.
- Suggested output files:
  - `extracted/documents.jsonl`
  - `extracted/manifest.json`
  - `extracted/notes.md`
