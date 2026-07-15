---
description: Android APK fast triage for CTF reverse engineering
agent: ctf-rev
subtask: false
---

Use `ctf-common`, `ctf-terminal`, and `ctf-rev` skills.

Target APK:
$ARGUMENTS

Run `ctf-apk-triage` first. Do not run full JADX until the triage result selects a Java/Kotlin checker route or targeted slicing fails.

If the APK is arm64-only, the expected profile matters, or dynamic native behavior is part of the blocker, run `ctf-android-runtime-doctor` before trusting emulator results.

If triage or follow-up evidence suggests shelling, `libshell.so`, `extract.dat`, code_item patching, classloader swap, reflection-heavy repair, or repeated JADX/apktool fragility, run `ctf-android-packed-closure-helper` and then `ctf-dex-patch-map` when patch offsets are available.

Use `ctf-android-dynamic-macro` only after runtime equivalence is understood and the install/start step is explicitly approved.

Return:

```text
APK_TRIAGE_RESULT:
- package:
- launch_activity:
- dex_count:
- native_libs:
- suspicious_assets:
- packing_signals:
- route:
- first_probe:
- artifact_paths:
```

If route is native/JNI, immediately continue with `ctf-android-native-triage`.
