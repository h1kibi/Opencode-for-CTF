---
description: Android native .so/JNI triage for APK reverse engineering
agent: ctf-rev
subtask: false
---

Use `ctf-common`, `ctf-terminal`, and `ctf-rev` skills.

Target APK or .so:
$ARGUMENTS

Run `ctf-android-native-triage` and identify the strongest JNI/native boundary.

Return:

```text
ANDROID_NATIVE_TRIAGE:
- primary_so:
- arch:
- JNI_OnLoad:
- RegisterNatives:
- Java_exports:
- compare_or_crypto_signals:
- likely_checker_boundary:
- next_probe:
- artifact_paths:
```

Prefer mapping Java native method names to JNI exports/RegisterNatives before deep reversing.
