#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

context.log_level = os.getenv("LOG", "info")
if os.path.exists(BIN):
    context.binary = ELF(BIN, checksec=False)


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
if os.getenv("RECVUNTIL"):
    io.recvuntil(os.getenv("RECVUNTIL").encode(), timeout=2)
if os.getenv("SEND"):
    io.send(os.getenv("SEND").encode())
elif os.getenv("SENDLINE"):
    io.sendline(os.getenv("SENDLINE").encode())
else:
    io.sendline(b"AAAA")  # TODO: replace with first canary payload
scan(io.recvall(timeout=float(os.getenv("TIMEOUT", "3"))))
