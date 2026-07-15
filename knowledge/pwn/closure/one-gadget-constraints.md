# Card: pwn.closure.one_gadget_constraints

## Trigger Signals
- libc base known
- one_gadget candidates
- register/stack constraints

## Core Idea
one_gadget constraints. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
# verify rsi==0, rdx==0, [rsp+0x30]==0, writable rbp
payload = chain_to(one_gadget)
```

## Confirm Oracle
Gadget executes under constraints.

## Falsify Oracle
Constraint not satisfied/crash.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- one_gadget

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- one_gadget

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
