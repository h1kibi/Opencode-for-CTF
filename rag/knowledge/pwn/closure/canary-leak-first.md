# canary leak first

## Trigger
- Canary is present and a stack overwrite family is still the best route.
- The branch is treating the challenge like raw control is available.

## Why it looks promising
- Simple and medium canary binaries often fold once one stack leak, format leak, or show-path leak is stabilized.

## What usually goes wrong
- The solver mutates payload length or partial overwrite theory before asking how to leak the canary.

## Better question
- What is the cheapest stack/read path that can expose the canary or bypass the return path entirely?

## First safe check
- Search for format-string output, stack/show leaks, and fork-oracle behavior before any brute-force or final chain work.

## Oracle
- A stack-derived leak exposes the canary, or a different non-return closure owner becomes clearly shorter.

## Stop rule
- Do not brute-force canary without a stable fork/retry oracle.

## Pivot rule
- If the canary does not need to be beaten because a non-return overwrite or direct file-read route exists, promote that route immediately.
