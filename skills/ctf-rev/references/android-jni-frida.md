# Android JNI / Frida Targeted Hooks

Use when APK reversing involves Java/Kotlin entrypoints, JNI/native libraries, reflection, dynamic loading, assets, or runtime-only secrets.

## Triggers

- APK with `lib/*.so`, `System.loadLibrary`, `JNI_OnLoad`, `RegisterNatives`, reflection, encrypted assets.
- Java validation calls native method or native code calls back into Java.
- Static JADX output shows target method but runtime values are hidden.

## First Safe Checks

1. Inspect manifest, launcher activity, exported components, assets, and native libs.
2. Locate Java validation method and JNI bridge arguments before Frida.
3. Inspect native exports, `JNI_OnLoad`, `RegisterNatives`, and string xrefs.
4. Hook only the target method/compare/decryptor; log arguments and return values.
5. Rebuild solver or patch minimal condition only after understanding the validation boundary.

## Mobile Bridge Ledger

| Java Method | Native Target | Args | Return | Asset/Constant | Hook Goal |
|---|---|---|---|---|---|

## Stop Rules

- Do not start blind Frida hooking before static bridge mapping.
- Do not bypass final result without extracting why the input is accepted.
- If anti-Frida triggers, load `anti-debug-anti-vm.md` and hook the detector first.
