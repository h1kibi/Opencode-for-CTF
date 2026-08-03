# Card: pwn.primitive.arbitrary_write_struct_pointer

## Trigger Signals
- struct contains data pointer
- overflow edits pointer field
- show/edit uses pointer

## Core Idea
Struct pointer AAR/AAW. Convert observed signals into the smallest primitive probe before closure work.

## Minimal Probe

```python
overwrite(obj.ptr, target)
show_or_edit(index)
```

## Confirm Oracle
Show leaks target or edit writes target.

## Falsify Oracle
Pointer field not reached/validated.

## Common Targets
- GOT / stack / heap / global object targets depending on trigger.

## Closure Paths
- object pointer hijack

## Version / Mitigation Notes
- Check PIE, canary, NX, RELRO, CET, seccomp, and glibc version before closure.

## Pitfalls
- Do not promote closure work before this primitive is minimally verified or falsified.
- Complex closure failure does not necessarily falsify the primitive.

## Anti-patterns
- Technique-name-first reasoning before signal-to-primitive compression.

## Related Cards
- object pointer hijack

## Example Micro-Challenges
- Add a minimal C challenge or retained sample that exposes these trigger signals.
