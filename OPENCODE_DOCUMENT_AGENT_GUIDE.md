# OpenCode Document Agent Guide

## Default flow

1. Use `doc-read` first.
2. For large PDFs, extract a page range first.
3. For images or scanned PDFs, use OCR only when necessary.
4. For complex layouts, use Docling MCP.
5. For broad Markdown conversion, use MarkItDown MCP.
6. Preserve source metadata for RAG.

## Tool selection

| Need | Tool |
|---|---|
| Fast local reading | doc-read |
| PDF page range extraction | doc-read |
| DOCX/XLSX/PPTX basic parsing | doc-read |
| Simple multi-format Markdown conversion | markitdown MCP |
| Complex PDF layout/table/formula parsing | docling MCP |
| Image OCR | doc-read with ocr=true |

## Safety

- Do not read `.env`, private keys, SSH files, token files, or credential stores.
- Do not enable all MCP servers by default.
- Do not send local files to remote services unless the user explicitly approves.
- Write generated outputs only under `extracted/` by default.

## MCP Installation

### MarkItDown MCP
```bash
python3 -m pip install markitdown-mcp
markitdown-mcp --help
```
To enable: set `"markitdown"` → `"enabled": true` in opencode.jsonc

### Docling MCP
```bash
uvx --from docling-mcp docling-mcp-server --help
# or
python3 -m pip install "docling-mcp[local]"
```
To enable: set `"docling"` → `"enabled": true` in opencode.jsonc

## Dependencies

```bash
python3 -m pip install -r requirements-docs.txt
```
OCR requires tesseract (system install). If unavailable, script returns polite error.
