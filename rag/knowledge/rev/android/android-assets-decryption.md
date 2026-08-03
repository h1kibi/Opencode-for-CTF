# Android Assets Decryption Route

## First signals

- Suspicious files under `assets/`, `res/raw/`, or `res/xml` with names such as `flag`, `payload`, `secret`, `key`, `enc`, `dat`, `bin`, `dex`, `so`.
- Java/Kotlin code opens assets and calls decode/decrypt/base64/xor functions.

## Preferred first probe

Use `ctf-apk-triage` to list suspicious assets. Then page `high-signal-strings.txt` or `zip-entries.txt` with `ctf-artifact-page`.

## Solver path

1. Extract only suspicious assets.
2. Identify decoder references with `ctf-jadx-targeted-slice`.
3. Reconstruct transform in `solve.py`.
4. Verify by matching decoded plaintext or app behavior.

## Stop rule

Do not decompile entire APK when asset names and decoder references are already enough to write `solve.py`.
