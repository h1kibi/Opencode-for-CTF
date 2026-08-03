# Flutter/Dart AOT Triage and Recovery

Quick-action card for Flutter AOT challenges in CTF.

## Signal Detection

| Signal | Source | Confidence |
|--------|--------|------------|
| `lib/arm64-v8a/libapp.so` present | APK unzip listing | High |
| `lib/arm64-v8a/libflutter.so` present | APK unzip listing | High |
| `flutter_assets/` in assets | APK structure | High |
| `io.flutter.embedding` | AndroidManifest.xml | High |
| Dart version string (e.g., "3.22.2") in libflutter.so | strings | Medium |
| `Dart_VmSnapshot` in strings | strings libapp.so | Medium |

## First Probe

1. `flutter_aot_triage` on APK or lib directory
2. If Flutter confirmed → `flutter_aot_recover` (runs Blutter automatically)
3. If output exists → `flutter_aot_summarize`

## Checker Search Pattern (after Blutter)

In `asm/*.S` output, search for:
- App package functions (exclude `dart::_`, `dart::core`, etc.)
- String references: success, fail, wrong, correct, flag, password
- Comparison patterns: `cmp`, `bl` to comparison helpers
- Crypto/hash imports: SHA, MD5, HMAC, AES, cipher

In `objs.txt` / `pp.txt`:
- Uint8List / Int8List / ByteData → likely byte arrays
- Pattern matching on string contents near checker functions

## Frida Integration

After Blutter produces `blutter_frida.js`:
1. Modify to hook specific checker function
2. Log arguments and return values
3. Trace execution path for input → validation → result

## Falsifier

- If `flutter_aot_triage` shows NO libapp.so → NOT Flutter AOT, route to standard Android REV
- If Blutter fails to detect Dart version → may be very old or very new Flutter; fall back to strings + dynamic
- If Blutter output has NO custom functions (only dart::internal) → app logic may be in a native plugin, not Dart

## Environment

- Blutter installed at `/opt/blutter` in WSL Kali (kali-linux)
- First run for new Dart version takes ~5-10 min to build
- Cached builds in `/opt/blutter/bin/` for reuse
