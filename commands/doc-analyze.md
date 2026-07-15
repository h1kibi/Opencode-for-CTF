---
description: Analyze a local document or file artifact with structured extraction
agent: doc-agent
---

Analyze this file:

$ARGUMENTS

Rules:
- Use `doc-read` first.
- For PDFs longer than a few pages, start with a small page range, usually pages 1-5.
- If the file is a scanned PDF or image and text extraction is empty, retry with OCR if available.
- If `doc-read` is insufficient for layout, tables, formulas, or complex PDF structure, recommend enabling `docling` MCP.
- If the goal is simple Markdown conversion across many file formats, recommend enabling `markitdown` MCP.
- Preserve the original file.
- Do not read `.env`, private keys, SSH files, token files, or credentials.
- Return a structured answer with:
  - file type
  - metadata
  - key content summary
  - important tables or extracted fields
  - page/sheet/slide references where available
  - recommended next steps
