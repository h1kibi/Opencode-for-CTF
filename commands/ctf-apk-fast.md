---
description: Fast-mode Android APK opening sequence for CTF REV
agent: ctf-master
subtask: false
---

Target APK:
$ARGUMENTS

Fast path:

1. Run `ctf-apk-triage`.
2. If route is `native_checker`, run `ctf-android-native-triage` and stop broad Java exploration.
3. If route is `java_kotlin_checker`, run `ctf-jadx-targeted-slice` with high-signal patterns.
4. If route is `assets_or_resource_decode`, inspect only suspicious assets first.
5. If route is packed/dynamic, run `ctf-android-packed-closure-helper`; for arm64-only native targets, run `ctf-android-runtime-doctor` before dynamic probing.
6. If DEX code_item patch records exist, run `ctf-dex-patch-map` before broad JADX/apktool browsing.

Do not block on full JADX during the fast opening.
