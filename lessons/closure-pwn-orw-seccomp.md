# closure-pwn-orw-seccomp

## Trigger
- A memory-corruption primitive exists, shell closure is blocked or unstable, and seccomp or sandbox evidence suggests open/read/write style closure.

## Why it looks promising
- A direct read-flag path is often shorter and more stable than shell recovery under syscall restrictions.

## What usually goes wrong
- The solver keeps trying ret2libc shell or one_gadget variants after seccomp already explains the failures.

## Better question
- Which allowed syscall sequence reaches the flag fastest with the current primitive?

## First corrective probe
- Identify or infer the allowed syscall set, then test one smallest ORW or file-print chain before any more shell-oriented payloads.

## Closure queue
1. classify allowed syscalls
2. choose one file-open strategy
3. read and write one concrete target path
4. stabilize output extraction
5. verify under the same sandbox/runtime

## Stop rule
- Do not continue shell-first payload mutation once seccomp or sandbox evidence clearly points to ORW/file-read closure.
