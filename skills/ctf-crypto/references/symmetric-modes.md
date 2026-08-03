# Symmetric Modes and Oracle Misuse

Use for ECB/CBC/CTR/GCM, nonce/IV reuse, padding oracles, bit flipping, weak MAC composition, and custom padding.

## Route

1. Identify mode, nonce/IV generation, block size, padding, MAC ordering, and oracle response classes.
2. Establish a baseline valid/invalid pair.
3. Change one block/bit at a time and classify status, length, timing, or structured-error differences.
4. Build a minimal deterministic solver only after the oracle is stable.

Stop when responses are indistinguishable or the operation would modify state beyond the challenge contract.

