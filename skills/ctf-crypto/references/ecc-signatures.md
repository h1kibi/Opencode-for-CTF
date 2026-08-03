# ECC and Signature Misuse

Use for ECDSA/EdDSA-like signatures, custom curves, invalid-curve/small-subgroup behavior, reused or biased nonces, and malleability.

## Inventory

Capture curve/field/order, generator, public key, hash encoding, signature encoding, nonce assumptions, verification equation, and all transcripts.

## Cheap discriminators

Check repeated `r`, nonce bias/leakage, incorrect subgroup/order checks, invalid-curve acceptance, weak hash truncation, and signature normalization. Write the exact equation before using lattice or algebra tooling.

Verify a recovered key/nonce by signing or checking an unused transcript against the challenge verifier.

