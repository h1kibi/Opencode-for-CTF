# Failure: partial control treated as full RCE

- family: failure
- category: pwn
- trigger: bug only corrupts a pointer, length, index, stale reference, or adjacent field, but not proven RIP/control-flow yet
- misleading signal: any memory corruption feels close enough to final ROP or shell design
- wrong behavior: starts building full exploit chains before promoting the limited corruption into a reusable read/write primitive
- damage: confuses primitive-ladder work with endgame work and hides the real missing step
- correction rule: first model the exact controlled field and the first reusable pointer/read/write target it can reach
- better next probe: test one structure-aware promotion target such as a length field, function pointer, vtable slot, GOT entry, or freed-link reuse path
