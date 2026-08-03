# Anti-Debug / Anti-VM Bypass Workflow

Local workflow card for binaries with anti-debug, anti-VM, anti-Frida, timing checks, or self-checksumming.

## Triggers

### Linux
- `ptrace(PTRACE_TRACEME, ...)` call
- `/proc/self/status` read with `TracerPid:` regex
- `getppid()` checks (often parent != shell)
- `rdtsc` / `clock_gettime` timing deltas
- `personality(PER_LINUX | ADDR_NO_RANDOMIZE)` self-disable ASLR

### Windows
- `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess` (with `ProcessDebugPort`/`ProcessDebugFlags`)
- PEB `BeingDebugged` byte (`fs:[0x30]+0x02` on x86, `gs:[0x60]+0x02` on x64)
- `NtGlobalFlag` PEB flag check
- Heap flag check (`HEAP_TAIL_CHECKING_ENABLED | HEAP_FREE_CHECKING_ENABLED`)
- TLS callbacks running before `main`
- `RDTSC` timing
- HW breakpoint detection (`Dr0..Dr7` register reads)
- SEH/VEH-based obfuscation

### Anti-VM
- `CPUID` brand string (looks for `VMware`, `VirtualBox`, `Xen`, `KVM`)
- MAC address prefix matching (`00:50:56` VMware, `08:00:27` VirtualBox)
- Specific files/registry keys (`/sys/class/dmi/id/product_name`, `HKLM\HARDWARE\DESCRIPTION\System\BIOS\SystemManufacturer`)
- Timing tests for instruction emulation overhead

### Anti-Frida
- `/proc/self/maps` scan for `frida-agent`/`gum-js-loop` strings
- TCP scan for default Frida port (27042)
- thread enumeration to detect unexpected threads

## First Safe Checks

1. `ctf-binary-probe` and grep `interesting_strings` for: `ptrace`, `IsDebuggerPresent`, `TracerPid`, `vmware`, `virtualbox`, `frida`
2. `ctf-elf-slice keyword="ptrace|tracerpid|isdebugger|rdtsc|cpuid"` (ELF) or PE equivalent
3. Locate first occurrence; usually in `init_array`, ctor, or `main` prologue
4. Decide bypass strategy: **patch / hook / trace stub / emulate**
5. Test bypass: confirm validation path (compare/check) is now reachable

## Bypass Strategies (in priority order)

| Strategy | When to Use | How |
|---|---|---|
| **Static patch** | Single check, deterministic | `objcopy` / `radare2 wo` / `pwntools elf.asm(addr, 'ret')` |
| **LD_PRELOAD hook** | Linux + libc-level check (`ptrace`, `time`) | gcc -shared -fPIC hook.c -ldl |
| **Frida hook** | Cross-platform, runtime-only | `Interceptor.attach(addr, { onEnter: ... })` |
| **GDB modify** | One-off check, want to inspect | `b *<check_addr>` then `set $eax=0` then `c` |
| **Emulate (Unicorn/Qiling)** | Heavy anti-debug, isolated checker | `ctf-rev-unicorn-helper` |
| **Run in clean VM** | Anti-VM-only check | use bare metal or different hypervisor |

## pwntools Patch Recipes

```python
from pwn import *
elf = ELF('./challenge', checksec=False)

# Replace function with immediate return (returns whatever was in eax)
elf.asm(elf.symbols.ptrace, 'ret')

# Force return 0 (bypass debugger present checks)
elf.asm(addr, 'xor eax, eax; ret')

# Force return 1 (force success)
elf.asm(addr, 'mov eax, 1; ret')

# NOP out instruction (skip check)
elf.asm(addr, 'nop')

elf.save('patched')
```

## LD_PRELOAD Hook Template

```c
// hook.c — compile: gcc -shared -fPIC hook.c -ldl -o hook.so
#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/ptrace.h>

long ptrace(long req, ...) {
    return 0;  // pretend ptrace always succeeds
}
```
Run: `LD_PRELOAD=./hook.so ./binary`

## Falsifier

- "Patched check but program still rejects" → multiple checks; grep entire `.text` for the same pattern
- "ptrace patched but `/proc/self/status` still shows TracerPid != 0" → second check; hook `read` syscall too
- "Anti-VM bypassed but flag still wrong" → that wasn't the validation; the anti-VM was a decoy
- "GDB step works through but native run rejects" → check uses `personality(ADDR_NO_RANDOMIZE)` to disable ASLR; bypass requires running with same setup

## Stop Rules

- Do not spend dynamic effort before confirming the anti-analysis check **blocks the validation path**
- Do not patch final compare to success unless the goal is **only to expose intermediate values**
- If bypass changes checker semantics → revert and use **tracing/stubbing** instead
- After 2 patches and 2 hooks fail → switch to emulation (`ctf-rev-unicorn-helper`)

## Companion Tools

- `ctf-binary-probe` — surface anti-debug strings
- `ctf-elf-slice` / `ctf-rev-pe-slice` — focused disasm
- `ctf-rev-live-memory-dump` — capture state past anti-debug barrier

## References

- `skills/ctf-rev/references/anti-debug-anti-vm.md`
- `skills-external/ctf-skills/ctf-reverse/anti-analysis.md`
- `skills-external/ctf-skills/ctf-reverse/anti-analysis-ctf.md`
