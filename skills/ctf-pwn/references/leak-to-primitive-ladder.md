# Leak to Primitive Ladder

Use when a PWN branch has a leak but no reliable final exploit yet. A leak is routing evidence, not success.

## Leak Classification

Every leaked address must be classified before base math:

- stack
- heap
- binary text / PIE
- libc
- ld
- vdso
- kernel
- unknown

Unknown-class leaks cannot drive final ROP.

## Ladder

1. Leak source is reachable and repeatable.
2. Leak bytes are parsed deterministically.
3. Pointer class is identified.
4. Base calculation uses a verified symbol/offset.
5. Base sanity range is checked.
6. A control/write primitive exists or is obtainable.
7. Closure route is selected: ret2libc, ROP, ORW, heap target, stack pivot.
8. Local exploit verifies the leak-to-control chain.
9. Remote adaptation checks drift before mutation.

## Common Leak Uses

| Leak | Enables |
|---|---|
| canary | return overwrite continuation |
| PIE/text | binary gadgets/win address |
| libc | system/binsh, mprotect, ORW symbols, hooks if version valid |
| stack | saved return overwrite, stack pivot, environ closure |
| heap | safe-linking bypass, heap base targets |
| ld | loader gadgets only when relevant |

## Fast Route

- If one leak gives direct flag/source/admin path, close immediately.
- If canary + PIE/libc are both needed, prioritize the leak with higher closure delta.
- If bundled libc exists, use `ctf-pwn-libc-resolver` before one_gadget/hook assumptions.

## False Positives

- Printing an address-shaped integer is not necessarily a pointer.
- A libc leak without control is not a ret2libc route.
- A canary leak without return overwrite is only partial progress.
- A stack leak without known frame relation may not locate saved RIP.

## Stop / Pivot Rule

If two leak attempts produce unstable or unknown-class pointers, pivot to protocol/source review or a different oracle instead of base roulette.

## Query Terms

pwn leak classify stack heap libc PIE, canary leak to ROP, libc leak base sanity, heap leak safe-linking, stack leak saved RIP
