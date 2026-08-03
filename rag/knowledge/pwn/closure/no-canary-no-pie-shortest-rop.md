# no canary no PIE shortest ROP

## Trigger
- No canary and no PIE are present.
- A simple BOF exists, but the branch is debating advanced routes before the shortest control-flow close is tested.

## Why it looks promising
- These binaries are often solvable with a direct ret2win, ret2plt, or minimal ret2libc without broader theory.

## What usually goes wrong
- The solver over-models the binary, opens heap or fake-stack ideas, or starts broad gadget enumeration before a tiny chain is tested.

## Better question
- What is the shortest successful chain under the current protections: direct win, direct imported function, or one leak-first ret2libc?

## First safe check
- Prove control width with `ctf-pwn-crash-probe`, then test in order: direct privileged symbol, imported `system`/`puts`/`printf` path, and only then small ret2libc.

## Oracle
- One minimal chain lands or a concrete blocker forces the next family.

## Stop rule
- Do not open heap, SROP, CSU, or stack-pivot families while direct or one-stage shortest ROP remains untested.

## Pivot rule
- If no direct target exists and leakless closure is blocked, move to leak-first ret2libc rather than generalized gadget hunting.
