# ELF Checker Slice — Workflow Card

## Trigger signals
- ELF 64/32 with `printf("Wrong")`/`puts("Correct")` style branch.
- `strcmp/strncmp/memcmp/strstr` xref against argv/stdin/file.
- Static array in `.rodata` / `.data` referenced by validation loop.

## First probe
1. `ctf-binary-probe` → mitigation matrix + interesting strings + suspicious imports.
2. `ctf-elf-slice keyword="(success|wrong|correct|flag|check|verify|encrypt|decrypt)"` → **slice-only**, do not dump full objdump.
3. Locate success/failure xrefs:
   ```bash
   objdump -dM intel <elf> | grep -B1 -A1 -i "wrong\|correct"
   ```

## Falsifier
- If success/failure strings exist but no xref reaches them, the binary either:
  - uses indirect comparison (function pointer / vtable / dispatcher) → switch to `ctf-pwn-vm-bytecode-helper`
  - prints them through wrapper `lprintf("...%s...")` → grep wrapper, then re-xref

## Stop rule
- After `ctf-elf-slice` returns `interesting_strings + named_symbols + candidate_functions` and no checker boundary emerges in 2 keyword sweeps, switch to `ctf-rev-pcap-network` (network protocol challenge) or load `ctf-rev` skill `references/custom-vm-lifter.md`.

## Closure path
- Constants/table extraction → `solve.py` reverse loop → verify with binary
- `ctf-rev-closure-ladder evidence="..."` to compress route into ranked closure templates

## Companion tools
- `ctf-elf-slice` (slice-only, avoids 50k+ line objdump)
- `ctf-go-binary-assist` (when binary is Go)
- `ctf-go-pclntool` (when Go pclntab unstable in IDA — use `go tool nm/objdump` for ground truth)
