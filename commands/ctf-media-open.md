---
description: Open a local image, PDF, or document through the shortest OCR-aware media path
agent: ctf-rev
subtask: false
---

Open a local media/document artifact through the unified media helper.

Target/context:
$ARGUMENTS

Use this when you want one entry point for:

- images with optional OCR
- scanned PDFs
- OCR-aware document opening
- quick media triage before deciding whether to pivot to stego/manual viewing/deeper parsing

Return:

```text
CTF_MEDIA_OPEN:
- target:
- media_kind:
- route:
- doc_read_image_ocr:
- image_preprocess_pipeline:
- barcode_qr_detection:
- recommendation:
- result:
```

Rule: let this command pick the shortest local path first; only widen into stego/manual/deeper parsing when the returned result is insufficient.
