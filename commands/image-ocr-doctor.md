---
description: Daily utility: check local image OCR and APK resource helper readiness
agent: daily
subtask: true
---

Check local OCR/image/APK resource helper readiness.

Context:
$ARGUMENTS

Use this when:

- `doc-read` image OCR is failing
- you are unsure whether `tesseract`, `magick`, or `zbarimg` exist
- you want to know whether local image OCR and APK resource fast-paths are ready

Run:

```text
node scripts/doctor-image-ocr.ts
```

Return should summarize:

- found tools
- missing required / optional tools
- whether `doc-read` image OCR is actually usable
- whether APK resource fast-path is available
- recommended fallback path
