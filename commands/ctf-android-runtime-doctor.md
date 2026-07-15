---
description: Check Android runtime ABI/API equivalence for APK REV
agent: ctf-rev
subtask: false
---

Check whether the current adb target is equivalent enough for Android native APK dynamic analysis.

Context:
$ARGUMENTS

Run `ctf-android-runtime-doctor` before any arm64-only native dynamic closure, especially when the APK has only `lib/arm64-v8a/*.so` or prior evidence mentions `libndk_translation`.

Return:

```text
ANDROID_RUNTIME_DOCTOR:
- verdict:
- selected_serial:
- target:
- device_android:
- device_abi:
- device_abilist:
- emulator:
- abi_equivalent:
- android_equivalent:
- libndk_translation_risk:
- recommendation:
```

Rule: if verdict is `NOT_EQUIVALENT_X86_TRANSLATION_RISK`, stop same-runtime native probing and switch to arm64 device/remote runtime or static/JNI patch extraction.
