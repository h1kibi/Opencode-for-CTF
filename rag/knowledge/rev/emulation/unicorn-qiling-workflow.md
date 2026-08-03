# Unicorn / Qiling Emulation Workflow

Local workflow card for using emulation to bypass anti-debug, isolated checker functions, or platform-bound binaries.

## Triggers
- Target function/checker address known from static analysis
- External syscalls/network/GUI/Android runtime block normal execution
- Anti-debug heavy (ptrace, IsDebuggerPresent, rdtsc timing) or self-modifying code post-decrypt
- Need intermediate state traces (per-byte input → output mapping)
- Foreign architecture (RISC-V, MIPS) host can't natively run

## First Safe Checks

1. `ctf-rev-unicorn-helper target=<binary>` — detect Unicorn API signals (`uc_open`, `uc_mem_map`, `uc_emu_start`), infer arch/mode, generate replay skeleton
2. Identify:
   - Function start/end address
   - Arch: x86_64, ARM64, RISC-V, MIPS
   - Calling convention: argument registers (RDI/RSI on amd64, X0-X7 on arm64, A0-A7 on riscv)
   - Stack/heap/code/rodata regions to map
   - Initial register state (often from `init_array` or runtime setup)
3. If unicorn API signals present in challenge binary → it's an emulation-based checker:
   - `ctf-rev-live-memory-dump` to capture post-decrypt payload
   - `ctf-rev-unicorn-replay-builder` to generate ready-to-run replay script

## Workflow Card

```text
Emulation Pipeline:
  1. Identify target function (start, end, args, return value semantics)
  2. Map memory regions:
     - .text / .rodata for code + constants (read-only)
     - .data / .bss for globals (read-write)
     - stack: 0x7ffff0000000 + 0x10000 (typical)
     - input buffer: separate region, write input bytes
  3. Initialize registers:
     - RIP/PC = function start
     - SP = stack top - 0x100 (leave room)
     - Argument regs = pointers to input/output buffers
  4. Hook: code/intr/mem to log state
  5. Run until end address or return
  6. Read output buffer or compare register
```

## Common Setup (x86_64 Linux)

```python
from unicorn import *
from unicorn.x86_const import *

mu = Uc(UC_ARCH_X86, UC_MODE_64)
mu.mem_map(0x400000, 0x100000)  # code/rodata
mu.mem_map(0x7ffff0000000, 0x10000)  # stack
mu.mem_map(0x600000, 0x10000)  # input/output

# Load .text bytes
mu.mem_write(0x400000, open(binary, 'rb').read()[text_off:text_off+text_size])

# Register init
mu.reg_write(UC_X86_REG_RSP, 0x7ffff0000000 + 0x8000)
mu.reg_write(UC_X86_REG_RDI, 0x600000)  # arg1: input buffer
mu.reg_write(UC_X86_REG_RSI, 0x600100)  # arg2: output buffer

# Write input
mu.mem_write(0x600000, b"AAAABBBB")

# Run
try:
    mu.emu_start(checker_addr, checker_addr + 0x1000)
except UcError as e:
    print(f"emu stop: {e}")

# Read output
result = mu.mem_read(0x600100, 16)
```

## Hook Patterns

```python
# Log every instruction
def hook_code(uc, address, size, _):
    print(f"PC=0x{address:x} size={size}")
mu.hook_add(UC_HOOK_CODE, hook_code)

# Log unmapped memory access (find missing mappings)
def hook_unmapped(uc, access, address, size, value, _):
    print(f"unmapped {access} @ 0x{address:x}")
    return False  # raise UcError
mu.hook_add(UC_HOOK_MEM_UNMAPPED, hook_unmapped)

# Stop at compare
STOP_PC = 0x401234
def hook_stop(uc, address, size, _):
    if address == STOP_PC:
        print(f"hit stop, reading state...")
        uc.emu_stop()
mu.hook_add(UC_HOOK_CODE, hook_stop)
```

## Falsifier

- "emu_start fails immediately" → likely unmapped page access; add `UC_HOOK_MEM_UNMAPPED` and grow mapping
- "result is all zeros" → forgot to write input; check `mem_write(input_buf, ...)` and arg register points to it
- "syscall exception" → checker calls libc; either stub it (`UC_HOOK_INTR` for `0x80`/`syscall`) or use Qiling instead
- "result differs from native" → check stack alignment (16-byte for amd64), TLS setup (FS/GS base register)

## Qiling Fallback

If Unicorn requires too much manual setup (full libc/syscall surface):

```python
from qiling import Qiling
ql = Qiling([binary], rootfs="/path/to/rootfs/x8664_linux", verbose=QL_VERBOSE.DEBUG)
ql.os.set_api("ptrace", lambda ql: 0)  # stub anti-debug
ql.run(begin=checker_addr, end=checker_addr + 0x1000)
```

Qiling auto-handles syscalls, libc, dynamic loading at the cost of ~10x slower than Unicorn.

## Stop Rules

- Don't emulate the **whole program** when a checker function can be isolated
- If setup uncertainty dominates (>3 hooks fail) → collect **one native trace** (gdb, strace) before adding more hooks
- Don't trust emulation until at least one concrete output **matches the real oracle** or exact reconstructed checker
- After 30 min of setup tinkering with no output → reconsider whether emulation is the right route; maybe direct invert is faster

## Recommended Tools

- `ctf-rev-unicorn-helper` — detect Unicorn signals, suggest setup
- `ctf-rev-unicorn-replay-builder` — generate ready-to-run replay script
- `ctf-rev-live-memory-dump` — capture post-decrypt payload before emulating
- `ctf-rev-closure-ladder` — confirm emulation is shortest closure path

## Companion References

- `skills/ctf-rev/references/unicorn-qiling-emulation.md`
- `ljagiello-ctf-skills/ctf-reverse/tools-emulation.md`
