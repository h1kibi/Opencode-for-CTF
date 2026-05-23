#!/usr/bin/env python3
from pwn import *
import argparse


context.log_level = "info"


def start(args):
    if args.remote:
        host, port = args.remote.split(":", 1)
        return remote(host, int(port))
    return process(args.binary)


def solve(args) -> None:
    io = start(args)

    # TODO: exploit steps.
    # io.sendline(...)
    # flag = io.recvline_contains(b"flag")

    io.interactive()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", default="./chall")
    parser.add_argument("--remote", help="host:port")
    args = parser.parse_args()
    solve(args)


if __name__ == "__main__":
    main()
