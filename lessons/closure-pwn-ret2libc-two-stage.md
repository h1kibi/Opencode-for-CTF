# closure-pwn-ret2libc-two-stage

## Trigger
- RIP/EIP control is proven, NX is enabled, and a ret2libc or staged ROP path is likely but not yet stable.

## Why it looks promising
- The branch already has the core ingredients for a standard leak-then-execute route.

## What usually goes wrong
- The solver mixes leak, base calculation, gadget rotation, and final chain construction before proving each stage independently.

## Better question
- What is the smallest first-stage chain that proves a stable leak and clean return to the vulnerable path?

## First corrective probe
- Build one leak-only stage with deterministic prompt sync, parse one pointer, compute one candidate base, and return safely for stage two.

## Closure queue
1. leak one classified pointer
2. compute one base candidate
3. verify symbol sanity against that base
4. build one minimal final chain
5. verify flag-read or shell path under the same runtime

## Stop rule
- Do not rotate gadgets, one_gadget offsets, or alternate libc guesses before one stable first-stage leak succeeds.
