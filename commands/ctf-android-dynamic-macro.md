---
description: Android APK dynamic macro for adb/logcat/run-as/frida hints
agent: ctf-rev
subtask: false
---

Run a low-noise Android dynamic collection macro for an approved CTF APK/device.

Target/context:
$ARGUMENTS

Use `ctf-android-runtime-doctor` first when native arm64 equivalence is uncertain. Then run `ctf-android-dynamic-macro` with explicit `apk`, `serial`, or `packageName` as available.

Safety:
- Default install is skipped unless `allowInstall=true` is explicitly chosen.
- Private app data is listing-first; do not pull or cat sensitive files until a concrete challenge-owned target is identified.
- Treat `run-as` failure as a normal signal, not a blocker.

Return:

```text
ANDROID_DYNAMIC_MACRO:
- verdict:
- selected_serial:
- package:
- launch_activity:
- out_dir:
- logcat:
- run_as:
- frida_suggestion:
- next:
```
