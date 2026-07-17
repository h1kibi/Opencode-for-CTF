# PWN Race and Concurrency Routing Card

Use when evidence contains threads, signals, `pthread`, `fork` servers, timers, `userfaultfd`, TOCTOU, shared global state, reference counters, async GC, callbacks, `sleep/usleep`, large `copy_from_user`, or repeated nondeterministic success/failure.

Imported references:
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\kernel-techniques.md`
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\advanced-exploits-4.md`
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\heap-fsop.md`

## Route Gate

Before repeated race attempts, record:

| Fact | Required detail |
|---|---|
| Shared object | pointer, index, fd, refcount, global state, heap chunk |
| Check operation | predicate, lock, copy, hash, validation path |
| Use/free operation | consumer, free path, delete path, callback |
| Window opener | copy_from_user, page fault, sleep, signal, GC, fork, I/O |
| Stabilizer | userfaultfd, mprotect/MADV, CPU pinning, huge buffer, retry loop |
| Oracle | leak, changed output, crash class, privilege/file read |

## First Safe Checks

1. Prove the two operations are independently reachable.
2. Confirm shared state survives long enough to race.
3. Add logging/timing harness locally where possible.
4. Try a low-volume deterministic window opener before blind retry loops.
5. Only then run repeated attempts with a stop condition.

## Stabilization Techniques

- `userfaultfd`: pause kernel copy on page fault, mutate state, resolve fault.
- Large `copy_from_user`: slow kernel copy to widen window.
- `mprotect` + `MADV_DONTNEED`: force repeated page faults during long validation.
- CPU affinity: place racing threads on chosen cores; split allocate/free CPUs for SLUB cross-cache.
- Signals/timers: interrupt between check and use.
- Fork server: brute-force canary or race with state reset, but count attempts and require progress oracle.
- GC trigger: force object finalization between alias creation and use.

## Primitive Ladder

1. Race window exists.
2. One controlled interleaving produces a differential.
3. Differential maps to UAF/double-free/OOB/state skip.
4. Overlap or target object is chosen.
5. Leak/write/control primitive stabilized.
6. Closure path selected.

## Stop Conditions

- No differential after the planned attempt budget.
- Only crashes with no class stability.
- Timing harness cannot distinguish phases.
- A source/static route can answer the same question cheaper.

## Notes Rule

For races, record attempt count, success rate, window technique, thread/core setup, and exact oracle. A payload spelling change does not reset the same-family counter unless it changes interleaving or oracle.
