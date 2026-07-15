# closure-pwn-leak-to-win

## Trigger
- A binary challenge has a verified leak, control primitive, or nearly-complete exploit path, but not yet the flag.

## Why it looks promising
- The hard part may already be done; the remaining task is exploit completion, correct base use, or flag-extraction logic.

## What usually goes wrong
- The solver keeps exploring other bug families or over-tuning before checking the shortest leak-to-win path.

## Better question
- What exact blocker remains between the current primitive and stable win/read-flag behavior?

## First corrective probe
- Classify the blocker precisely: wrong base, missing gadget, stack alignment, seccomp route, libc mismatch, read-flag path, or output extraction.

## Closure queue
1. fix the current blocker
2. direct read-flag or ORW path
3. exploit stabilization under matching libc/remote behavior
4. one minimal local verification
5. one remote replay if appropriate

## Stop rule
- Do not reopen exploit-family discovery when the branch is already leak/control complete enough to finish.
