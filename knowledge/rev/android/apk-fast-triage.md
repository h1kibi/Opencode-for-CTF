# Android APK Fast Triage

## First signals

- APK file, large `classes.dex`, multiple dex files, native `lib/**/*.so`, suspicious `assets/`, or slow JADX startup.
- Need package name, launch activity, permissions, native libraries, and route recommendation before decompilation.

## Preferred first probe

Run `ctf-apk-triage` before full JADX.

Expected output:

- package / launch activity / sdk
- permissions
- dex count
- native library list and ABI
- `System.loadLibrary` / JNI loader strings
- suspicious assets / raw / xml entries
- packer/dynamic loader signals
- flag-like and checker strings
- route recommendation

## Route mapping

- `direct_flag_or_plaintext` -> verify once, stop broad exploration.
- `native_checker` -> run `ctf-android-native-triage` immediately.
- `java_kotlin_checker` -> run `ctf-jadx-targeted-slice` with `flag|check|verify|success|wrong|loadLibrary`.
- `assets_or_resource_decode` -> extract suspicious assets and model decoder before full Java reading.
- `packed_or_dynamic_loader` -> prefer runtime/logcat/frida gate or loader-focused slices.

## Stop rule

Do not wait on full JADX until route-gated. If triage cannot classify after manifest/dex/native/assets scan, escalate to rigorous REV with the artifact paths.
