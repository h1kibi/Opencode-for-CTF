# PE Checker Slice — Workflow Card

## Trigger signals
- Windows .exe / .dll with MessageBox / WriteConsole / printf wrapper.
- Imports: `kernel32!CreateFileW`, `advapi32!CryptDecrypt`, `crypt32!*`.
- High-entropy sections (>7.0) or odd `.text` size vs raw size mismatch.
- TLS callback (`IMAGE_DIRECTORY_ENTRY_TLS`) present.

## First probe
1. `ctf-rev-pe-slice` with default keywords → PE metadata + suspicious imports + entropy per section + disasm slices.
2. If entropy of `.text` > 7.0 or sections like `.aspack`/`.upx0` present → likely packed → switch to `knowledge/rev/packed/upx-and-custom-packer.md`.
3. If imports include `Crypt*` family → switch to `knowledge/rev/elf-pe/crypto-api-checker.md` (next card).

## Falsifier
- "All MessageBox say generic things" — actual flag check may be in TLS callback fired before `main`. Inspect `IMAGE_DIRECTORY_ENTRY_TLS` first.
- "Imports look fine but logic empty" — likely `LoadLibrary + GetProcAddress` runtime resolve. Run dynamic with `ctf-rev-live-memory-dump`.

## Stop rule
- After 2 keyword slices and no validation boundary, run dynamic dump in revlab container:
  ```text
  ctf-rev-live-memory-dump target=<binary> marker="<observed stdout>" dumpStart=0x400000 dumpSize=0x4000
  ```

## Closure path
- Extract algorithm into `solve.py`, verify candidate against original binary in container
- For Crypt API family: identify key/IV source (registry, file, env, user input) before solving

## Companion tools
- `ctf-rev-pe-slice` (PE-specific)
- `ctf-rev-live-memory-dump` (post-unpack capture)
- `ctf-rev-unicorn-helper` + `ctf-rev-unicorn-replay-builder` (when checker is isolated function)
