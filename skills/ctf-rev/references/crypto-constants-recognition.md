# Crypto Constants Recognition in RE

Use when reverse logic appears crypto-like: block rounds, S-boxes, hash constants, TEA/XTEA deltas, AES tables, RC4 KSA/PRGA, SM4 constants, or custom ciphers.

## Triggers

- Known constants: AES S-box/T-tables, MD5/SHA K constants, TEA `0x9e3779b9`, SM4 FK/CK, CRC polynomials.
- Repeated rounds, block operations, rotations, endian packing, key schedule loops.
- Compare against ciphertext/digest after transform.

## First Safe Checks

1. Identify primitive family, block size, rounds, mode, padding, endian, and compare point.
2. Distinguish standard primitive from challenge-custom transform.
3. Extract key/IV/nonce/table sources and input/output layout.
4. Prefer known inverse/library verification once standard primitive is confirmed.
5. If custom, encode exact round function and invert/solve only the necessary checker path.

## Crypto-Like Ledger

| Primitive Guess | Evidence Constants | Block/State | Key Source | Compare | Inverse Route |
|---|---|---|---|---|---|

## Stop Rules

- Do not label logic AES/TEA/hash only from one constant; require round/dataflow alignment.
- Do not brute force keys before mapping key source and compare oracle.
- If primitive recognition fails after one focused pass, return to generic checker slicing instead of crypto guessing.
