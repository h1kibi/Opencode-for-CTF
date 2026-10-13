# Windows Packed / Memory-Reconstructed PE

Use for Windows PE challenges where the on-disk file is a stub, section names were changed, code appears only after runtime writes, or Ghidra/ReVa recovers far too few functions from a rebuilt image.

## Triggers

- `MZ`/PE file with high-entropy sections, missing imports, renamed UPX/packer sections, or an entry point outside normal `.text`.
- Challenge hints mention memory dump, runtime unpack, self-decrypt, or an interactive stdin checker.
- The on-disk image decompiles to a near-empty stub: imports are missing or the entry point jumps straight into runtime-written memory.
- Rebuilt memory image exists but Ghidra/ReVa only recognizes a handful of functions.

## First Steps

1. Run `ctf-env-check category=rev`. Check the reported debugger and decompiler results (for example `cli:x64dbg` and `cli:cdb`) before choosing a tool path.
2. If the target is not running yet, run `ctf-pe-unpack target=<pe> launch=true`. This detects packer/entropy signals, launches the target, dumps the in-memory image, and writes a rebuilt PE.
3. If the target is already running, use `ctf-runtime-dump processName=<name>` or `ctf-runtime-dump pid=<pid>` directly.
4. Run `ctf-pe-hybrid-rebuild original=<pe> memoryImage=<runtime-module-bin>` when a pure memory rebuild has poor ReVa/Ghidra function recovery. This keeps the original imports/header/resources and replaces executable sections from the dump.
5. Search dumped memory with `ctf-memstr target=<dump-dir-or-bin>` for ASCII and UTF-16 strings before decompilation.
6. Recover x64 function boundaries from the hybrid/rebuilt PE with `ctf-rev-pe-recovery target=<pe> linear=true`. It emits:
   - `recover_pdata.py` for Ghidra function creation from `.pdata`/`RUNTIME_FUNCTION`
   - `pdata_addresses.txt` for ReVa entry candidates
   - `linear_disasm.txt` from bounded `objdump` batches

## Rebuilt PE Analysis

- In Ghidra, run the generated `recover_pdata.py` before trusting auto-analysis function count. It tries multiple `createFunction` signatures for version compatibility.
- In ReVa, import `pdata_addresses.txt` as function entry candidates before decompilation.
- Open the rebuilt PE in Ghidra or ReVa; use bounded `objdump` ranges when a local disassembly check is faster than a full auto-analysis pass.
- Prefer `.pdata` seeds and bounded linear disassembly over one full linear pass on a 3MB+ `.text` section.

## Interactive Checker Automation

For programs that read stdin and branch on comparison logic:

- Use `ctf-windows-expect-runner` for stable text/file stdin, timeout kill, and stdout/stderr capture without Python subprocess instability.
- Use `ctf-windows-debug-helper debugger=cdb run=true` when cdb/WinDbg is available. It generates a command file and runner that can supply stdin, set breakpoints, and read registers/memory.
- When only x64dbg exists, use `ctf-windows-debug-helper debugger=x64dbg` to generate an x64dbg command script and launch stub. x64dbg remains GUI-only; do not expect reliable headless CLI automation.

## Windows Memory Notes

- `ctf-runtime-dump` uses `OpenProcess`/`VirtualQueryEx`/`ReadProcessMemory`. If access is denied, launch the target from the same user context or provide the already-running PID.
- Default `mainOnly=true` keeps system DLLs out of the dump. Set `mainOnly=false` or use `mode=range` only when the checker lives in a non-main module or a specific address range.
- Prefer `ctf-memstr` over ad hoc Python string printing; it avoids Windows console encoding crashes and handles odd-offset UTF-16 strings.
- When `upx -d` fails with `NotPackedException` because section names changed, do not fight the packer stub. Go to runtime dump + PE rebuild directly.

## Stop Rules

- Do not manually reverse a packer stub when a runtime dump reveals the real checker faster.
- Do not use `radare2 -A` as the primary analyzer on a rebuilt PE; function discovery is unreliable there.
- Do not attempt full linear disassembly of a large memory-rebuilt `.text` in one call; use `ctf-rev-pe-recovery linear=true` batches.
