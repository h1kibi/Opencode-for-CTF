# format string leak before write

## Trigger
- `printf(user)` or equivalent uncontrolled format output exists.
- The branch is considering `%n` or write targets before a stable offset/leak map exists.

## Why it looks promising
- Many medium template fmt solves need only a read-first map: canary, PIE, libc, stack, or direct secret exposure.

## What usually goes wrong
- The solver jumps to write-oriented fmt play before proving offset, positional behavior, null truncation, and a useful leak.

## Better question
- What leak-only format payload gives the most useful classified pointer or direct secret before any write attempt?

## First safe check
- Run `ctf-pwn-format-map`, determine positional vs non-positional behavior, and lock one leak-only payload before `%n` exploration.

## Oracle
- A stable leak map appears, or the output proves the family is not useful enough to drive closure.

## Stop rule
- No `%n` writes before offset, RELRO, and target writability are explicit.

## Pivot rule
- If a read-only leak already closes the challenge through stack/heap/flag exposure, demote write-first fmt ideas.
