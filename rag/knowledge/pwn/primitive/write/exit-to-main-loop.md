# Card: pwn.primitive.exit_to_main_loop

## Trigger Signals
- need second stage
- main/vuln reusable
- return or exit@got controllable

## Core Idea
Exit to main loop. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
payload = leak_chain + [main_or_vuln]
# or overwrite exit@got -> main
```

## Confirm Oracle
Program prompts again after leak.

## Falsify Oracle
State corrupted or reentry unsafe.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- two-stage leak

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- two-stage leak

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
