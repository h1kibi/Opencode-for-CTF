# Card: pwn.primitive.saved_rbp_stack_pivot

## Trigger Signals
- saved rbp overwrite
- leave; ret epilogue
- writable fake stack

## Core Idea
Saved RBP stack pivot. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
fake = p64(next_rbp)+p64(next_rip)+chain
payload = b"A"*off_rbp + p64(fake_stack) + p64(leave_ret)
```

## Confirm Oracle
After leave, rsp/rbp/rip come from fake stack.

## Falsify Oracle
Fake stack unreadable or leave not reached.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- stack pivot, multi-stage ROP

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- stack pivot, multi-stage ROP

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
