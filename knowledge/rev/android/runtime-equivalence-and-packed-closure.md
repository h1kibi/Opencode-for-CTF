# Android Runtime Equivalence and Packed Closure

Use this note when an APK challenge depends on native runtime behavior, shell repair, second-stage dex loading, or code_item patching.

## Trigger Signals

- APK only contains `lib/arm64-v8a/*.so`, but the current adb target is `x86_64`.
- Logcat or crash evidence mentions `libndk_translation`.
- Challenge expects a profile such as Pixel 4a / Android 11 / arm64.
- Packed APK has `libshell.so`, `extract.dat`, `DexClassLoader`, `PathClassLoader`, `InMemoryDexClassLoader`, JNI patching, or runtime DEX repair.
- `jadx` or `apktool` fails globally, but triage found a narrow loader/checker/patch boundary.

## First Probe Order

1. Run `ctf-android-runtime-doctor` with the current serial and expected target ABI/API.
2. If the verdict is `NOT_EQUIVALENT_X86_TRANSLATION_RISK`, stop same-runtime native probing and switch to static/JNI patch extraction or an arm64 device/remote runtime.
3. Run `ctf-android-packed-closure-helper` with the compact triage/runtime evidence.
4. If DEX patch records exist, convert them to offset/size records and run `ctf-dex-patch-map` against APK or `classes.dex`.
5. If `old/new` patch bytes are available, use the `ctf-dex-patch-map` byte/code-unit diff to see whether the current DEX still matches the pre-patch or post-patch side.
6. Inspect only mapped owner methods and the native/JNI patch writer boundary.
7. If dynamic collection is still useful and approved, run `ctf-android-dynamic-macro` for install/start/logcat/run-as/tombstone/frida hints.
8. On x86_64 emulator, treat dynamic output as supporting evidence for loader names, Java control flow, private-dir artifacts, and log markers; do not use it as final proof for arm64 native correctness.

## Runtime Reality on x86 Windows

- Android Studio on x86_64 Windows generally cannot directly boot arm64-v8a system images.
- An x86_64 emulator with translation is not equivalent for arm64-only native-shell closure.
- In the current short-term setup, Android Studio x86_64 emulator is still useful as a Java/UI/logcat reconnaissance target, but not as a trustworthy arm64 native closure target.
- Recommended substitutes are: physical arm64 Android 11 device, cloud/remote arm64 device, ARM host emulator, or static extraction of the native patcher and repaired DEX logic.

## Short-Term Best Practice When Only Android Studio Emulator Exists

Use the emulator deliberately for these tasks:

- package/activity confirmation
- Java-side launch flow
- logcat markers
- classloader / DexClassLoader evidence
- file/artifact discovery under `run-as`
- confirming whether a packed shell drops or repairs DEX-related files

Avoid trusting it for these tasks:

- arm64 native checker correctness
- JNI behavior that depends on true arm64 runtime
- anti-emulation conclusions
- final closure of `libshell.so` / native patch writer logic when translation is involved

## Practical Runtime Matrix

| Current option | Can it run APK UI | Can it close arm64-only native shell/JNI logic reliably | Notes |
|---|---|---|---|
| Android Studio x86_64 emulator on x86 Windows | Usually yes | No / not trustworthy | Good for Java/UI surface, bad for arm64 native equivalence. Stop if `libndk_translation` appears. |
| Android Studio arm64 AVD on x86 Windows host | Usually no | No | Commonly blocked by emulator/host architecture limits. Do not spend time forcing this path. |
| Physical arm64 Android 11 phone | Yes | Yes | Best local closure target for Pixel-like native APK challenges. |
| Remote/cloud arm64 Android device | Yes | Usually yes | Good substitute when no local phone exists; record version/API/ABI mismatch explicitly. |
| ARM host running Android emulator | Yes | Usually yes | Viable if you have Apple Silicon/Linux ARM or comparable ARM virtualization access. |
| Static/JNI patch extraction only | N/A | Partial but often enough | Best fallback when runtime equivalence is blocked and patch/checker ownership can be mapped statically. |

## Recommended Escalation Order When No True arm64 Device Exists

1. Prove the mismatch quickly with `ctf-android-runtime-doctor`.
2. Stop x86_64-native closure attempts after mismatch is confirmed.
3. Run `ctf-android-packed-closure-helper` to choose patch/JNI/classloader route.
4. Run `ctf-dex-patch-map` on patch records to shrink the Java surface.
5. Reverse the native patch writer / repaired owner methods statically.
6. Only resume dynamic confirmation when a real arm64 runtime becomes available.

## Stop Rules

- Do not spend more dynamic time on an x86_64 emulator after `libndk_translation` or missing arm64 ABI evidence appears.
- Do not wait for full JADX/apktool output when patch ownership or loader boundary is already available.
- Do not hook broad Java methods before mapping JNI/native patch writer and repaired method owners.

## Evidence to Record

| Item | Evidence |
|---|---|
| Device ABI/API | `ctf-android-runtime-doctor` output |
| Translation risk | `libndk_translation`, x86_64-only ABI list, or native load failure |
| Patch source | `extract.dat`, native writer, loader method, or logcat marker |
| Patch owner | `ctf-dex-patch-map` class/method/code_item hit |
| Patch side | `ctf-dex-patch-map` old/new byte match against current DEX |
| Closure next probe | One owner method, one native writer, or one Frida/logcat boundary |
