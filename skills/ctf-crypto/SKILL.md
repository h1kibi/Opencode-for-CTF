---
name: ctf-crypto
description: Use for authorized crypto CTF challenges involving RSA, ECC, lattices, hashes, block ciphers, stream ciphers, PRNGs, signatures, padding oracles, classical ciphers, or protocol mistakes.
compatibility: opencode
---

# CTF Crypto

## Purpose

Use this skill to turn challenge parameters and oracle behavior into a mathematical weakness, proof-of-concept, and deterministic solver.

## Scope

Use only on provided CTF/lab crypto material or explicitly authorized services.

## Inputs

Collect:

- Primitive, parameters, public data, ciphertexts, signatures, source, oracle API, and flag format.
- Randomness source, nonce behavior, padding, encoding, and protocol transcript.
- Bounds for brute force or search.

## Workflow

1. Identify the primitive and security assumption.
2. Normalize encodings and parse all numeric parameters.
3. Check common weaknesses: small RSA exponent, shared primes, bad nonce, reused keystream, biased randomness, padding oracle, length extension, invalid curves, weak curves, insecure mode, or protocol composition error.
4. Write the math hypothesis in `notes.md` before coding.
5. Test on a small sample or self-generated toy instance when possible.
6. Implement deterministic recovery in Python first; use Sage for algebra, lattices, number fields, or elliptic curves.
7. Verify plaintext, key, or forged value against the challenge constraints.

## Tool Discipline

- Do not brute force without bounding search space and runtime.
- Keep conversions explicit: bytes, integers, endian, base64, hex, compression, padding.
- Use exact arithmetic for number theory.
- Log failed hypotheses so later attempts do not repeat them.

## Evidence Requirements

Crypto solutions require:

- Stated weakness.
- Parameter evidence.
- Recovery or forgery script.
- Decoded output matching flag format or challenge verification.

## Output Contract

Produce `solve.py` or `solve.sage` with all parameters embedded or loaded from challenge files. The solver should print the recovered flag or final secret.

## Stop Conditions

Stop or ask when the only path is unbounded brute force, the oracle is unavailable, parameters are missing, or the conclusion depends on guessing the flag.
