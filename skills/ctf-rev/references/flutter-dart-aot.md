# Flutter/Dart AOT Reverse Engineering

Use for Flutter mobile application CTF challenges where the main logic is compiled as Dart AOT snapshot inside `libapp.so`.

## Triggers

- APK with `lib/arm64-v8a/libapp.so` and `lib/arm64-v8a/libflutter.so`
- Dart snapshot header magic in libapp.so
- Flutter engine version strings in libflutter.so
- `io.flutter.embedding` in AndroidManifest.xml
- `flutter_assets/` directory in APK assets

## First Safe Checks

1. Run `flutter_aot_triage` on the APK or lib directory.
2. Confirm Flutter AOT: look for libapp.so + libflutter.so pair.
3. Note Dart version from libflutter.so strings (e.g., "3.22.2").

## Tool Pipeline

### Step 1: Blutter (Automated via `flutter_aot_recover`)

Blutter is the primary tool for Dart AOT recovery. It:
- Auto-detects Dart version from libflutter.so
- Checks out matching Dart VM source
- Builds Blutter executable for that version (first run only, cached)
- Decompile libapp.so Dart snapshot into:
  - `asm/*.S` — assembly with symbol names
  - `blutter_frida.js` — Frida hook template
  - `objs.txt` — complete object pool dump
  - `pp.txt` — Dart objects in object pool

Run: `flutter_aot_recover input_path="path/to/app/lib/arm64-v8a" output_dir="work/blutter_out"`

### Step 2: Summarize (via `flutter_aot_summarize`)

After Blutter completes, summarize to find:
- App-specific custom functions (filter out dart::internal)
- Success/failure string references
- Byte arrays / cipher / hash objects
- Frida template preview

Run: `flutter_aot_summarize output_dir="work/blutter_out"`

### Step 3: Manual Analysis

After automated recovery:
1. **Search asm/ for checker patterns**: `grep -r "success\|fail\|wrong\|correct" asm/`
2. **Find input validation**: Look for `strcmp`, comparison loops, length checks in custom functions
3. **Extract constants**: Check `objs.txt` and `pp.txt` for encoded byte arrays
4. **Use Frida for dynamic**: Start from `blutter_frida.js` template, hook checker functions

## Key Concepts

- **Dart AOT Snapshot**: Pre-compiled Dart heap snapshot embedded in libapp.so. Not standard ELF code — requires specialized decompiler.
- **Object Pool**: Dart's constant pool containing strings, arrays, and class metadata.
- **Blutter**: Compiles Dart AOT runtime to provide symbol information for libapp.so disassembly.
- **Dart Version Lock**: Each Flutter/Dart version has different snapshot format. Blutter must match version exactly.

## Fallback When Blutter Fails

1. **Strings + xrefs**: `strings libapp.so` + grep for flag format, success/failure, input prompts
2. **Frida dynamic hooks**: Hook `libflutter.so` functions to trace Dart execution
3. **Dart VM internals**: If Blutter can't build for the version, use Dart SDK's `dart analyze` on snapshot
4. **Memory dump at runtime**: Run app in emulator, dump process memory after input, search for flag

## Stop Rules

- After Blutter output exists, do NOT re-run Blutter without `--rebuild` unless Dart version changed.
- Do NOT manually disassemble libapp.so in IDA/Ghidra expecting meaningful cross-references without Blutter symbols.
- If Blutter fails to build for a specific Dart version, fall back to strings + dynamic analysis rather than fighting the build chain.

## Verification

Run recovered flag candidate through the app when possible. If emulator is unavailable, verify against exact reconstructed checker logic from Blutter asm output.

## Environment Requirements

- WSL Kali (kali-linux) with Blutter installed at `/opt/blutter`
- cmake, ninja, clang, libcapstone-dev, libicu-dev, python3-pyelftools, python3-requests
- Internet access for first-time Dart VM checkout (via proxy or direct)
