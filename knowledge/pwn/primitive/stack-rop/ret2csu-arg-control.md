# Card: pwn.primitive.ret2csu_arg_control

## Trigger Signals
- missing pop rdx/rsi
- CSU pop/call gadget shape
- need rdi/rsi/rdx

## Core Idea
ret2csu argument control. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = b"A"*off + p64(csu_pop) + p64(0)+p64(1)+p64(func_ptr)+p64(rdx)+p64(rsi)+p64(rdi)+p64(csu_call)
```

## Confirm Oracle
Controlled benign call receives expected args.

## Falsify Oracle
No paired CSU shape or simpler route dominates.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- ret2csu

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- ret2csu

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
