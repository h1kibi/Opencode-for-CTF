# ret2win direct closure

## Trigger
- A `win`, `print_flag`, `backdoor`, `system`, or equivalent privileged function is reachable from a direct overwrite path.
- Canary is absent or already neutralized.
- The branch is opening broader ROP or libc work before a direct jump is tested.

## Why it looks promising
- The shortest flag path may already be present in the binary.
- A direct control-transfer close is usually cheaper and more stable than leak-first expansion.

## What usually goes wrong
- The solver opens ret2libc, gadget hunting, or shellcode work before proving the obvious direct target.
- The branch treats all control as if full general ROP is required.

## Better question
- What is the smallest payload that proves control can land on the privileged function under the current protocol?

## First safe check
- Prove exact control with `ctf-pwn-crash-probe`, identify the privileged symbol with `ctf-binary-probe` or symbols/strings, and run one minimal ret2win payload before any larger chain.

## Oracle
- The process reaches the privileged function, prints a stronger differential, or cleanly falsifies the direct path.

## Stop rule
- Do not build ret2libc, ret2csu, or shellcode before one direct ret2win attempt is either confirmed blocked or falsified by a concrete oracle.

## Pivot rule
- If the direct target needs arguments, alignment, or a base leak, downgrade to the smallest matching next family: ret2plt, leak-first ret2libc, or PIE/base-first.
