# Failure: version roulette before route gating

- family: failure
- category: pwn
- trigger: exploit route depends on glibc/libc assumptions, but exact version, loader, or allocator behavior is still unconstrained
- misleading signal: one wrong gadget, offset, or heap behavior suggests the current family is dead
- wrong behavior: rotates libc guesses, one-gadget offsets, heap versions, or container assumptions before obtaining one constraining clue
- damage: burns branch budget on version noise instead of reducing the dependency
- correction rule: write which exploit assumptions are version-sensitive, then find one cheapest clue to confirm or kill that dependency before route commitment
- better next probe: obtain one leak, allocator-behavior fingerprint, symbol clue, or Docker/libc alignment check before changing family
