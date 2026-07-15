#!/usr/bin/env python3
"""CTF reverse-engineering solver template.

Fill the extracted checker, inversion, or emulator logic. Keep this file
standalone and deterministic so the final answer can be reproduced from a clean
challenge copy.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


FLAG_OUT = Path("agent_flag.txt")


def rol8(x: int, r: int) -> int:
    r &= 7
    x &= 0xFF
    return ((x << r) | (x >> (8 - r))) & 0xFF


def ror8(x: int, r: int) -> int:
    r &= 7
    x &= 0xFF
    return ((x >> r) | (x << (8 - r))) & 0xFF


def check_candidate(candidate: str) -> bool:
    """Reconstructed checker. Replace with exact extracted semantics."""
    # TODO: encode length/domain/constants/transform/comparison exactly.
    return bool(candidate)


def solve() -> str:
    """Return the verified flag/input candidate."""
    # TODO: implement one of:
    # - direct constant extraction
    # - XOR/add/sub/rotate/table inversion
    # - z3/angr model result
    # - custom VM / bytecode / WASM / pyc emulator output
    # - crypto primitive inverse
    candidate = ""
    if not check_candidate(candidate):
        raise RuntimeError("candidate failed reconstructed checker")
    return candidate


def verify_with_binary(candidate: str, binary: str | None) -> bool:
    """Optional clean-state verification against the original artifact."""
    if not binary:
        return True
    proc = subprocess.run(
        [binary],
        input=(candidate + "\n").encode(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=5,
        check=False,
    )
    output = proc.stdout.decode(errors="replace")
    # TODO: replace with exact success oracle from challenge strings/output.
    return proc.returncode == 0 or "success" in output.lower() or "correct" in output.lower()


def main() -> None:
    parser = argparse.ArgumentParser(description="reproduce reverse challenge solve")
    parser.add_argument("--binary", help="optional original binary/app wrapper for final verification")
    parser.add_argument("--no-write", action="store_true", help="do not write agent_flag.txt")
    args = parser.parse_args()

    flag = solve()
    if not verify_with_binary(flag, args.binary):
        raise RuntimeError("candidate failed original artifact verification")

    print(flag)
    if not args.no_write:
        FLAG_OUT.write_text(flag.strip() + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
