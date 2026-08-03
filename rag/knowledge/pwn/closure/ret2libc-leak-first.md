# ret2libc leak-first closure

## Trigger
- RIP/EIP control is proven, NX is enabled, and a libc route is likely.
- A leak path exists through `puts`, `printf`, `write`, a show function, or a format string.
- The branch is rotating gadgets or final chains before a stable first-stage leak exists.

## Why it looks promising
- Simple and medium binaries are often solved by one classified leak, one base calculation, and one minimal final chain.

## What usually goes wrong
- Leak, base math, gadget choice, and final execution get mixed together before stage one is stabilized.
- The solver jumps to `one_gadget` or alternate libc guesses before one leak is trustworthy.

## Better question
- What is the smallest first-stage chain that leaks one classified pointer and safely returns for stage two?

## First safe check
- Build one leak-only stage, parse one pointer, compute one candidate base, and return to the vulnerable path before any final chain mutation.

## Oracle
- A stable classified leak appears and produces a sane libc base.

## Stop rule
- Do not rotate `one_gadget`, alternate libc guesses, or multi-call final chains before one stable leak-first stage works.

## Pivot rule
- If shell closure is blocked or seccomp evidence appears, promote ORW/read-flag over shell-first ret2libc closure.
