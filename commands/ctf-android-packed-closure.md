---
description: Android packed/native APK closure route selector
agent: ctf-rev
subtask: false
---

Classify packed/native Android REV evidence and choose the shortest next probe.

Evidence:
$ARGUMENTS

Run `ctf-android-packed-closure-helper` after APK triage, native triage, logcat, or decompiler failure evidence indicates shelling, JNI repair, classloader swap, code_item patching, or ABI mismatch.

Preferred usage for hard APK shell/native tasks:

- give `apk` when available so the helper can auto-chain `ctf-apk-triage`, `ctf-android-native-triage`, and `ctf-android-runtime-doctor`
- give `patchFile` when `extract.dat` or patch records exist so it can auto-chain `ctf-dex-patch-map`
- when patch owners are found, the helper will also try a focused `ctf-jadx-targeted-slice` around the hit package/method area
- give `serial` only when you want runtime-doctor to evaluate the current adb target

Return:

```text
ANDROID_PACKED_CLOSURE:
- route:
- runtime_verdict:
- apk_primary_route:
- signals:
- patch_rows:
- hit_methods:
- package_hint:
- jadx_hits:
- jadx_top_files:
- selected_next_probe:
- closure_order:
- stop_rules:
```

Rule: do not continue global decompilation or x86 emulator probing when the helper selects a tighter patch/JNI/runtime-equivalence probe.
