#!/usr/bin/env python3
from pwn import *
import argparse
import re


context.log_level = "info"


def start(args):
    if args.remote:
        host, port = args.remote.split(":", 1)
        return remote(host, int(port))
    return process(args.binary)


def extract_flag(data: bytes) -> str | None:
    match = re.search(rb"(?:flag|ctf|csaw|nyu|uiuctf|ictf)\{[^\r\n}]+\}", data, re.I)
    return match.group(0).decode() if match else None


def write_flag(flag: str) -> None:
    print(flag)
    with open("agent_flag.txt", "w", encoding="utf-8") as handle:
        handle.write(flag.strip() + "\n")


def solve(args) -> None:
    io = start(args)

    # TODO: exploit steps.
    # io.sendline(...)

    if args.interactive:
        io.interactive()
        return

    data = io.recvall(timeout=2)
    flag = extract_flag(data)
    if flag:
        write_flag(flag)
        return

    log.warning("No flag found in output. Use --interactive manually only for debugging.")
    print(data.decode(errors="replace"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", default="./chall")
    parser.add_argument("--remote", help="host:port")
    parser.add_argument("--interactive", action="store_true")
    args = parser.parse_args()
    solve(args)


if __name__ == "__main__":
    main()
