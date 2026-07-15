# failure-pwn-heap-leak-not-classified

## Trigger
- A 5-8 byte leak appears during a heap/UAF branch.
- The solver suspects it may be a heap or tcache-related pointer.

## Why it looks promising
- The branch already has a leak, so it feels like progress even without classifying what memory region it belongs to.

## What usually goes wrong
- The solver keeps treating the leak as "interesting" without deciding whether it is heap, libc, PIE, stack, or safe-linked fd.
- Base math and next probes drift because the leak is never promoted into a concrete memory model.

## Better question
- Is this leak heap, libc, PIE, stack, anonymous mapping, or a safe-linked tcache fd candidate?

## First corrective probe
- Run leak classification: maps range check, page alignment, high-byte stability, and safe-linking hypothesis check.

## Stop rule
- Do not compute base addresses or choose a final heap technique from an unknown-class leak.

## Reuse query terms
- heap leak not classified
- safe-linking fd candidate
- 6 byte leak heap libc pie classify
