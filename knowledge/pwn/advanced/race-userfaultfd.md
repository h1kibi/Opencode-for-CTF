# Card: pwn.advanced.race_userfaultfd

## Trigger Signals
- race/thread/signal/fork
- userfaultfd or blocking primitive
- TOCTOU/refcount clues
- nondeterministic success

## Core Idea
Turn nondeterminism into a repeatable oracle and controlled schedule.

## Minimal Probe

```text
instrument operations and timing
prove before/after state race
stabilize with blocking primitive if allowed
```

## Confirm Oracle
Race win changes object lifetime/state predictably.

## Falsify Oracle
No timing window or primitive cannot be stabilized.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.heap.uaf_stale_read

## Version / Mitigation Notes
Kernel may restrict userfaultfd; remote timing differs.

## Pitfalls
- mutating payloads without measuring race window
- ignoring fork/server model

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.heap.uaf_stale_read

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
