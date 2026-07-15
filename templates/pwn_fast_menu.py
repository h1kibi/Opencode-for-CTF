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


def sla(io, prompt, data):
    return io.sendlineafter(prompt, str(data).encode() if isinstance(data, int) else data)


def add(io, size, data):
    # TODO: adjust menu labels
    sla(io, b"> ", b"1")
    sla(io, b"size", size)
    sla(io, b"data", data)


def delete(io, idx):
    sla(io, b"> ", b"2")
    sla(io, b"idx", idx)


def show(io, idx):
    sla(io, b"> ", b"3")
    sla(io, b"idx", idx)
    return io.recvuntil(b"\n", timeout=2)


def edit(io, idx, data):
    sla(io, b"> ", b"4")
    sla(io, b"idx", idx)
    sla(io, b"data", data)


io = start()
# Fast heap rule: prove one primitive only. If allocator reasoning becomes non-trivial, hand off.
# TODO: add/delete/show/edit sequence here.
scan(io.recvall(timeout=1))
raise SystemExit("TODO: fill menu helpers and one primitive proof sequence")
