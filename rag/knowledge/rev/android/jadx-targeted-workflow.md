# JADX Targeted Workflow

## Problem

Cold JADX on large APKs is slow and produces too much output for fast mode.

## First probe

Use `ctf-jadx-targeted-slice` rather than full-output decompilation.

Useful patterns:

```text
flag|check|verify|success|correct|wrong|native|loadLibrary|JNI|decrypt|encrypt|base64|xor|secret|password
```

## Workflow

1. Run `ctf-apk-triage`.
2. If Java route is likely, run targeted JADX slice.
3. Follow only hit classes/methods.
4. If snippets indicate JNI, switch to native triage.
5. If snippets indicate asset decode, extract the asset and reconstruct the decoder.

## Stop rule

If targeted JADX produces no high-value snippets and native/assets/packer signals exist, stop broad Java reading and switch route.
