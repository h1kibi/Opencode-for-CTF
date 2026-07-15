---
description: Open a hard Android packed/native APK challenge with the shortest closure-oriented chain
agent: ctf-rev
subtask: false
---

Open an Android APK shell/native challenge with the packed-closure pipeline.

Target/context:
$ARGUMENTS

Use this command when the APK shows one or more of these signals:

- `libshell.so`, stub/protect/loader behavior, or JNI-heavy startup
- `extract.dat`, `classes.dex` patching, `code_item` repair, or hot patch records
- `DexClassLoader` / `PathClassLoader` / second-stage dex loading
- `jadx`/`apktool` instability on the full APK
- arm64-only native libraries where runtime equivalence matters

Opening chain:

1. Run `ctf-android-packed-closure-helper` in auto-chain mode.
2. Give `apk` whenever available.
3. Give `patchFile` when `extract.dat` or patch records exist.
4. Give `serial` only if you want runtime-doctor to inspect the current adb target.
5. Trust focused outputs over broad decompilation:
   - `ctf-apk-triage`
   - `ctf-android-native-triage`
   - `ctf-android-runtime-doctor`
   - `ctf-dex-patch-map`
   - focused `ctf-jadx-targeted-slice` when patch owners are found

Return:

```text
ANDROID_PACKED_OPEN:
- route:
- runtime_verdict:
- apk_primary_route:
- patch_rows:
- hit_methods:
- package_hint:
- jadx_hits:
- jadx_top_files:
- artifact_dir:
- summary:
- handoff:
- selected_next_probe:
- closure_order:
- stop_rules:
```

Artifacts:

- `work/android-packed-open/<apk>/summary.json` for machine-readable resume/handoff
- `work/android-packed-open/<apk>/handoff.md` for quick human restart context

Rules:

- On x86_64 Android Studio emulator, use runtime results only as supporting evidence when `arm64-v8a` native closure is required.
- Do not block on full JADX if the helper already found patch owners, JNI boundaries, or focused Java hits.
- After owner methods are identified, inspect only those methods and the native patch writer / classloader boundary before widening scope.
