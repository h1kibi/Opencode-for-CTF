# Expected Behavior: menu-read-contract-lock

## Scenario

Interactive PWN program mixes menu prompts with exact-length reads such as `read(size+1)` or other raw input phases. Without fixing helper semantics early, leftover bytes or implicit newlines pollute later menu probes and cause false route drift.

## Agent Should

1. Recognize exact-length or mixed menu/raw input evidence early.
2. Run `ctf-pwn-menu-contract-probe` or establish an equivalent helper contract.
3. Separate line-based menu helpers from raw payload helpers.
4. Record whether a newline remains buffered after the exact-length read.
5. Reuse the locked helpers for later probes instead of improvising more `sendline` variants.

## Agent Should Not

- Keep alternating `send` / `sendline` blindly after a suspected exact-length read.
- Treat polluted menu state as proof the exploit family is wrong.
- Delay helper locking until after several failed probes.

## Success Signal

- A helper contract is explicit before further exploit mutation.
- Subsequent probes use the fixed helper semantics.
- Later failures are attributed to exploit logic or runtime evidence, not leftover menu bytes.
