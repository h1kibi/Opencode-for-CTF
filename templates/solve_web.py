#!/usr/bin/env python3
import argparse
import requests


def solve(base_url: str) -> str:
    session = requests.Session()

    # TODO: reproduce exploit deterministically.
    # response = session.get(f"{base_url}/...")
    # flag = ...

    raise NotImplementedError("fill exploit")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    args = parser.parse_args()

    flag = solve(args.url.rstrip("/"))
    print(flag)
    with open("agent_flag.txt", "w", encoding="utf-8") as handle:
        handle.write(flag.strip() + "\n")


if __name__ == "__main__":
    main()
