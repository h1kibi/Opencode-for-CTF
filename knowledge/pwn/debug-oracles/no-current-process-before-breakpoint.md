# Card: pwn.debug.no_current_process_before_breakpoint

## Trigger Signals
- gdb says no current process
- program exited before breakpoint
- payload shorter than expected
- read boundary mismatch

## Core Idea
Normal exit before breakpoint often means payload/input did not exercise the path, not exploit logic failure.

## Minimal Probe

```text
check payload length/sha256
map stdin segments
break earlier at read/callsite
```

## Confirm Oracle
Correct payload reaches breakpoint.

## Falsify Oracle
Even correct payload exits because path condition not met.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.primitive.saved_rip_control

## Version / Mitigation Notes
Use payload artifact and stdin segment map.

## Pitfalls
- debugging ROP when payload file is truncated

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.primitive.saved_rip_control

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
