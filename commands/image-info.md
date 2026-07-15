---
description: Daily utility: Inspect local image metadata/dimensions without vision model input
agent: daily
subtask: true
---

Use `image-file-info` for daily-mode image/document metadata inspection when the model cannot read image pixels directly.

Image target:
$ARGUMENTS

Rules:

- If the model says it cannot read an image, do not retry direct visual reading.
- If a local file path like `image.png` is provided, do not use generic file read first; route directly to `image-file-info`.
- Use `image-file-info` to inspect file type, size, dimensions, metadata, trailing data, embedded zip signature, and text hints.
- If the user needs visual interpretation, tell them this model lacks vision input and ask for a textual description, OCR text, or a vision-capable model.
- For CTF/stego image tasks, switch to `ctf-master` and use `ctf-stego-probe` instead.

Typical call:

```text
image-file-info target=<path> exif=true
```
