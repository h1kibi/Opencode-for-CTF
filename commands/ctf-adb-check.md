---
description: Check Android adb/frida runtime readiness for CTF REV
agent: ctf-rev
subtask: false
---

Check Android dynamic-analysis readiness for the provided context:
$ARGUMENTS

Run `ctf-android-runtime-check` for generic adb/frida readiness. If native ABI/API equivalence matters, the APK is arm64-only, the expected profile is specific, or prior evidence mentions `libndk_translation`, also run `ctf-android-runtime-doctor`. If the runtime is equivalent enough and dynamic collection is approved, prefer `ctf-android-dynamic-macro` over hand-assembling adb/logcat/run-as steps. Do not install, uninstall, start, stop, or modify apps unless the user explicitly approves.

Return:

```text
ANDROID_RUNTIME_READY:
- adb_available:
- selected_device:
- android_version:
- abi:
- root_hint:
- frida_status:
- runtime_equivalence: equivalent/partial/not_equivalent/unknown
- libndk_translation_risk: yes/no/unknown
- can_install: yes/no/ask
- can_hook: yes/no/unknown
- next_dynamic_probe:
```
