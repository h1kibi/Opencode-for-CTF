# free_hook -> setcontext+53 -> ORW

## Trigger

Use this card when:
- glibc version still supports relevant hook-adjacent routes or the environment exposes a strong context-write primitive
- `setcontext+53` or a nearby context restore gadget is available
- shell is blocked, seccomp is present, or ORW is the shortest reliable closure
- you already have a write primitive to heap, `.bss`, hook-adjacent memory, or a known context frame location

## First Safe Check

1. Resolve glibc version and offsets with `ctf-pwn-libc-resolver` and `ctf-pwn-libc-fingerprint`.
2. Confirm whether hook routes are still valid for this glibc bucket.
3. Verify you can place a stable frame or context structure in writable memory.

## Route Pressure

Promote this route when:
- `__free_hook` or a comparable trigger exists and is reachable
- direct shell is blocked or less reliable than ORW
- FILE corruption is possible but higher-friction than context restore

Demote this route when:
- hooks are removed/unreliable for the current glibc bucket
- a direct output-hijack or ORW route exists without context restore complexity

## Closure Preference

1. use the hook/context route to restore registers and stack state
2. run the shortest ORW/file-read chain
3. print the flag, not a shell, unless shell is strictly shorter

## Anti-Pattern

Do not keep polishing shell aesthetics after `setcontext+53` already makes ORW straightforward.

## Stop Rule

If you cannot prove frame placement, trigger, and post-restore control in the next focused probes, rerank to direct ORW, fake stdout, or output-hijack closure.
