# Card: pwn.primitive.shellcode_badchars

## Trigger Signals
- shellcode route
- input filtered/truncated
- badchars or newline/null restrictions
- stage2 read possible

## Core Idea
Use a small decoder/stager or read second-stage shellcode into clean memory.

## Minimal Probe

```text
send stage1 read stub / decoder
read stage2 shellcode to RWX/RW page
jump stage2
```

## Confirm Oracle
Stage2 bytes match intended shellcode and executes.

## Falsify Oracle
Transform corrupts bytes or no executable target.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.closure.mprotect_shellcode
- pwn.primitive.saved_rip_control

## Version / Mitigation Notes
Depends on input channel and NX/mprotect.

## Pitfalls
- writing shellcode via text encoder unintentionally
- not hexdumping artifact length

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.closure.mprotect_shellcode
- pwn.primitive.saved_rip_control

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
