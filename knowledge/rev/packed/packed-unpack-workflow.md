# Packed / Self-Modifying Binary Workflow

Local workflow card for UPX, custom packers, self-decrypting code, runtime unpackers.

## Triggers
- High entropy executable sections (>7.0)
- Tiny imports table (e.g. only `LoadLibrary`, `GetProcAddress`)
- UPX/ASPack/Themida/VMProtect strings
- RWX section flags
- `VirtualProtect`/`mprotect`/`mmap`/`WriteProcessMemory` followed by jumps to newly written/executable memory
- Static strings missing but runtime output exists
- Section names like `UPX0`/`UPX1`/`.aspack`/`.boom`/`.themida`

## First Safe Checks

1. `ctf-binary-probe target=<binary>` → check `packer_suspected` field (`upx`/`generic`/`none`) and `packer_signals`
2. If `packer_suspected=upx`: try `upx -d` first (in revlab container):
   ```text
   ctf-pwn-docker-runner image=revlab:ubuntu22.04 \
     script="cd /work && upx -d ./binary -o ./binary.unpacked"
   ```
3. If UPX fails or `packer_suspected=generic`: switch to runtime dump strategy
4. Identify packer family via section names + entropy + imports + strings
5. Locate unpacker stub: usually short prologue then big jump/branch into newly-written memory

## Workflow Card

| Stage | Action | Tool |
|---|---|---|
| Detect | Entropy + section names + import scarcity | `ctf-binary-probe`, `ctf-rev-pe-slice` |
| Try standard | `upx -d`, `aspack -e`, etc. | revlab container |
| Locate stub | Find first `mprotect`/`VirtualProtect`/`WriteProcessMemory` | `ctf-elf-slice keyword=mprotect\|VirtualProtect\|jmp` |
| Set marker | Identify stable stdout/state marker after unpack | source/decompile reading |
| Live dump | Capture post-unpack code | `ctf-rev-live-memory-dump target=<binary> marker="..." dumpStart=0x... dumpSize=0x...` |
| Continue | Apply `elf-checker-slice` / `vm-bytecode-workflow` on dumped code | normal rev workflow |

## Live Dump Strategy

```text
1. Run binary in revlab container, observe stable output line
2. Use that output line as MARKER
3. ctf-rev-live-memory-dump generates rev_live_dump.sh
4. Run script, get payload.dump.bin
5. file/strings/objdump on payload.dump.bin to confirm successful unpack
6. If dump still encrypted: marker may be too early, move marker to later output
```

## Falsifier

- "UPX -d works" → not the challenge intent; just unpack and move on
- "After dump, payload still high-entropy" → second-stage unpacker; iterate dump cycle with new marker
- "Marker only appears with correct input" → unpacker uses input as decryption key; recover key first or brute force
- "Packer is VMProtect/Themida" → don't reverse the unpacker; use direct emulation/Frida hooks at known addresses

## Stop Rules

- Do not manually reverse a packer stub if runtime dump reveals the real checker faster
- Do not run unknown binaries outside the revlab container (controlled environment)
- If unpacking stalls after 2 marker iterations → switch to **targeted dynamic trace** of input boundary and compare function (skip unpack entirely)
- For VMProtect/Themida: do not attempt full deobfuscation; hook at boundary

## Companion Tools

- `ctf-rev-live-memory-dump` — generate dump script with FIFO + /proc/<pid>/mem
- `ctf-rev-pe-slice` (PE) / `ctf-elf-slice` (ELF) — section + entropy analysis
- `ctf-binary-probe` — `packer_suspected` field

## References

- `skills/ctf-rev/references/packed-unpack-trace.md`
- `skills-external/ctf-skills/ctf-reverse/patterns.md` § Self-Modifying Code
