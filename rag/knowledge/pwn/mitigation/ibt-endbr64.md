# Card: pwn.mitigation.ibt_endbr64

## Trigger Signals
- CET IBT property
- endbr64 in disassembly
- indirect call/jmp hijack

## Core Idea
Indirect branch targets may need ENDBR64; ret-based control often differs from call/jmp hijack.

## Minimal Probe

```text
check crash type
choose ENDBR target for indirect call
test ret path separately
```

## Confirm Oracle
Crash disappears with ENDBR-valid target.

## Falsify Oracle
IBT not enforced at runtime.

## Common Targets
- Runtime/mitigation-specific.

## Closure Paths
- pwn.mitigation.shstk

## Version / Mitigation Notes
Many CTFs show property but enforcement varies.

## Pitfalls
- assuming ret is blocked like indirect jmp

## Anti-patterns
- Do not reuse assumptions from another libc/kernel/build without fingerprinting.

## Related Cards
- pwn.mitigation.shstk

## Example Micro-Challenges
- Keep a tiny sample or command transcript that demonstrates this card.
