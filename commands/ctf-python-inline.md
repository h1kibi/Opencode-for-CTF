---
description: Run a short Python snippet through a temp file instead of a PowerShell one-liner
agent: ctf-rev
subtask: false
---

Run a short Python snippet through the local `ctf-python-inline` helper.

Context:
$ARGUMENTS

Use this when you need to quickly test:

- encoding/decoding transforms
- XOR/base64/byte shuffles
- small solver fragments
- APK/resource string reconstruction
- image or data post-processing

Rule: prefer this over hand-written PowerShell one-line Python when the snippet is more than trivial.
