---
description: Open a local image artifact with metadata, OCR attempt, and fallback summary
agent: ctf-rev
subtask: false
---

Open a local image artifact through the image/OCR helper path.

Target/context:
$ARGUMENTS

Use this when you need one entry point for:

- image metadata and dimensions
- OCR attempt when available
- quick diagnosis of whether local OCR tooling exists
- deciding whether to pivot to stego/QR/manual viewing

Return:

```text
CTF_IMAGE_OPEN:
- target:
- ocr_attempted:
- doc_read_image_ocr:
- image_preprocess_pipeline:
- barcode_qr_detection:
- recommendation:
- image_info:
- ocr_result:
```

Rule: if OCR engine is unavailable, use the returned fallback summary instead of retrying broken local OCR blindly.
