# Over-Reconstructed Fake Stack Before Original Callsite Probe

## Symptoms

- saved `rbp` is controllable;
- original function has `[rbp-k] -> call` or `lea r?, [rbp-k]; mov rdi, r?; call printf/puts`;
- agent starts building fake-stack libc calls;
- agent debugs libc internal crashes, stdio corruption, GOT-page pollution, or synthetic frame instability;
- original callsite primitive was not minimally tested.

## Fix

Return to primitive compression:

1. identify `k`;
2. identify the callsite reentry address;
3. choose one fixed readable target such as `printf@got`;
4. set `rbp = target + k`;
5. set `rip = callsite`;
6. use one minimal payload and one oracle.

## Lesson

Original callsite reuse outranks synthetic closure construction. A fake-stack `printf` crash does not prove `printf(printf@got)` via the original callsite fails.
