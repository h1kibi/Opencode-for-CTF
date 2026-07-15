---
description: Android shell/unpacker dynamic debugging checklist and helper scripts
agent: ctf-rev
subtask: false
---

Target context:
$ARGUMENTS

Use this command when an APK looks packed, dynamically loads dex/so, or needs runtime extraction.

Required sequence:

1. Run `ctf-android-runtime-check` to verify adb/frida visibility.
2. Use `templates/android_apk_run_log.ps1` for install/start/logcat capture when user approves install/start.
3. Use `templates/android_private_dir_diff.ps1` before and after launch if `run-as <package>` works.
4. Use `templates/android_pull_private_file.ps1` to export runtime dex/apk/dat/so artifacts.
5. Use `templates/frida_android_shell_trace.js` for DexClassLoader, AssetManager, System.load, FileOutputStream, and native open/dlopen traces.

Return:

```text
ANDROID_SHELL_DEBUG:
- device_ready:
- package:
- launch_method:
- logcat_artifacts:
- run_as:
- private_dir_artifacts:
- frida_status:
- extracted_payloads:
- next_static_analysis:
```
