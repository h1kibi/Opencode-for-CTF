# Android Native JNI Routing

## First signals

- `System.loadLibrary`, `JNI_OnLoad`, `RegisterNatives`, `Java_com_...`, native method declarations, or `lib*.so` in APK.

## Preferred first probe

Run `ctf-android-native-triage` on the APK or the selected `.so`.

## Evidence to collect

- ABI and primary library.
- `JNI_OnLoad` presence.
- `RegisterNatives` import/string/symbol hints.
- Exported `Java_*` functions.
- Imports such as `strcmp`, `strncmp`, `memcmp`, `strlen`, `__android_log_print`, `ptrace`.
- Suspicious strings: `flag`, `check`, `verify`, `correct`, `wrong`, crypto names, anti-debug strings.

## Next probes

- Exported `Java_*`: use `ctf-elf-slice`/IDA/ReVa focused on that symbol.
- `RegisterNatives`: recover registration table and map Java method name/signature to native function pointer.
- Anti-debug strings: confirm guard before patching or Frida bypass.

## Stop rule

Do not keep reading Java/Kotlin broadly after a native checker boundary is proven. Map Java input -> JNI function -> native compare/transform.
