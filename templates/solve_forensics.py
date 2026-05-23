#!/usr/bin/env python3
import argparse
from pathlib import Path


def solve(path: Path) -> str:
    # TODO: parse or extract from the provided artifact.
    raise NotImplementedError("fill forensics solve")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact")
    args = parser.parse_args()

    flag = solve(Path(args.artifact))
    print(flag)
    with open("agent_flag.txt", "w", encoding="utf-8") as handle:
        handle.write(flag.strip() + "\n")


if __name__ == "__main__":
    main()
