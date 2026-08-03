# Android Frida First Probes

## Trigger

- Static triage finds dynamic loading, anti-debug, encrypted runtime state, or checker boundary that is easier to observe than reconstruct.

## Gate

Run `ctf-android-runtime-check` before any install/hook attempt.

Collect:

- adb device serial
- Android version / ABI
- root hint
- frida-server visibility
- `/data/local/tmp` availability

## Probe choices

- Java checker: hook target Java method entry/return.
- Native checker: hook exported `Java_*` or RegisterNatives target after mapping.
- Asset decode: hook file open/read/decrypt return.
- Anti-debug: hook `ptrace`, `TracerPid`, emulator/root checks.

## Safety

- `adb install` / uninstall / app mutation should remain ask-gated.
- Prefer logcat and read-only process listing before hooks.
