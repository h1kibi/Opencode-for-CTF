# Crypto Reference Index

Use this file as the top-level trigger map for `skills/ctf-crypto/references/`. Keep the crypto skill thin and route by primitive, parameter shape, and oracle behavior.

## RSA / Modulus Families

- textbook / weak RSA / partial leak / common modulus
  - `rsa.md`

- small exponent / padding / misuse / broadcast
  - `rsa.md`

## Symmetric / Stream / Modes

- nonce / IV reuse / padding oracle / mode misuse
  - `symmetric-modes.md`

- stream cipher / keystream reuse
  - `stream-reuse.md`

## ECC / Signatures

- invalid curve / small subgroup / nonce leakage / signature misuse
  - `ecc-signatures.md`

## PRNG / State Recovery

- LCG / MT / time seed / low entropy seed
  - `prng-state-recovery.md`

## Classical / Encodings / Layered Transforms

- XOR / substitution / transposition / base encodings / compression stacks
  - `classical-encoding-chain.md`

## Trigger Rules

- If the branch is RSA-shaped, start with `rsa.md` and `ctf-rsa-probe`.
- If a challenge is clearly parameter- or oracle-driven, build a parameter inventory before coding.
- If the first attack path fails, pivot to the nearest reversible/family-specific fallback before brute force.
- If the problem is not crypto-shaped after normalization, hand off to misc/rev/forensics as evidence dictates.

## Maintenance Rule

When adding a new Crypto reference, update this index with:

- trigger evidence
- owning primitive family
- whether it is direct attack, fallback, or historical-pattern support
