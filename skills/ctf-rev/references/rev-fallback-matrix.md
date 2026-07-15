# Rev Fallback Matrix

Use this when a reverse engineering branch stalls. Pick exactly one fallback that improves the validation path, exact semantics, or verification oracle.

| Failed Stage | Symptom | Fallback | Stop / Pivot Rule |
|---|---|---|---|
| Artifact Triage | File type or runtime unclear | Identify format, architecture, packer/runtime, dependencies, and execution method | If not rev-shaped, route to misc/forensics/pwn |
| Flutter AOT Detection | libapp.so + libflutter.so present | Run `flutter_aot_triage` → `flutter_aot_recover` (Blutter) → search asm/ for checker patterns | Do NOT attempt manual IDA/Ghidra cross-ref on libapp.so without Blutter symbols |
| Validation Discovery | No checker found | Xref success/failure strings, input prompts, compare imports, crypto/hash imports, exit paths | After two broad decompiler passes, stop and use xrefs/trace |
| Entry Confusion | Main is noisy or framework-generated | Find user-controlled input boundary and nearest custom code; for Go/Rust use string xrefs and call graph hints | Do not fully read framework boilerplate |
| Constants Extraction | Tables/bytes hidden in data/resources | Dump nearby rodata/resources/assets, decode obvious base/xor/compression, inspect constructors/init arrays | If constants are runtime-built, switch to trace or instrumentation |
| Semantics | Decompiler output ambiguous | Verify assembly for signedness, width, truncation, endianness, rotations, and loop bounds | Treat pseudocode as hypothesis until verified |
| Solver | Manual inversion stalls | Write an executable checker/emulator first, then brute force/z3/invert piecewise | Do not solve long logic only in prose |
| Crypto-like Logic | Looks like TEA/AES/hash/custom cipher | Identify constants, block size, rounds, mode, key schedule, and compare point | If standard primitive confirmed, use known inverse/attack instead of manual loops |
| Anti-analysis | Debugger/emulator blocked | Prefer static bypass, patch condition, environment stub, or targeted trace of validation only | Avoid broad dynamic runs outside sandbox |
| Mobile Bridge | APK/JAR uses JNI/reflection/assets | Map manifest/activity, Java xrefs, native exports, asset decryptors, and bridge arguments | Start Frida only after target method/native call is known |
| VM/Obfuscation | Dispatcher/bytecode found | Identify bytecode blob, opcode table, dispatch loop, handler semantics, and trace oracle | Do not fully deobfuscate before extracting trace/check semantics |
| Final Verification | Candidate not accepted | Recheck encoding, newline, wrapper format, signedness, byte order, and exact comparison length | Do not guess flags; verify or report need for missing runtime |

High-information fallbacks:

- Xrefs from success/failure strings beat broad decompilation.
- Executable checker extraction beats manual pseudocode solving.
- Assembly verification beats trusting decompiler arithmetic.
- Targeted dynamic trace beats full instrumentation.
- Mobile static bridge mapping beats blind Frida hooks.
