# musl Heap Differences

## Trigger

Use this card when the target runtime is Alpine/musl or challenge Docker indicates musl instead of glibc.

## First Safe Check

1. Confirm musl with `ctf-pwn-docker-harness` or runtime artifacts.
2. Prefer the challenge runtime over generic glibc pwnlab assumptions.
3. Re-verify allocator behavior before applying glibc-specific heap routes.

## Route Pressure

- Demote glibc hook, tcache, and classic FSOP assumptions.
- Promote syscall, logic, direct file-read, and runtime-accurate debugging.
- Treat glibc writeups as references only after musl-specific behavior is reconciled.

## Stop Rule

If the branch still relies on glibc-only heap assumptions, stop and relock the runtime before more heap mutation.
