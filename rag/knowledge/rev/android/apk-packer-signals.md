# APK Packer and Dynamic Loader Signals

## Signals

- `DexClassLoader`, `PathClassLoader`, `loadDex`, `loadClass`.
- Assets or libs named `shell`, `payload`, `protect`, `stub`, `jiagu`, `bangcle`, `ijiami`, `legu`, `secneo`.
- Small loader activity plus large encrypted asset.
- Native `JNI_OnLoad` with few Java checker clues.

## Preferred route

Do not rely on full static JADX. Prefer:

1. `ctf-apk-triage` to collect loader/assets/native hints.
2. Loader-focused `ctf-jadx-targeted-slice`.
3. Runtime dump/logcat/Frida if post-load code is needed.
4. `ctf-rev-live-memory-dump` or Unicorn/Qiling route only after a stable observation point exists.

## Stop rule

After two static loader-only passes with no checker, promote runtime observation rather than continuing full-decompile drift.
