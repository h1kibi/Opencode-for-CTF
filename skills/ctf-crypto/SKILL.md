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

## Contract

- Load `references/REFERENCE_INDEX.md` first when the primitive is unclear.
- For RSA challenges, load `references/rsa.md` and prefer `ctf-rsa-probe` before writing attacks.
- Keep `notes.md` small, explicit, and reversible-first.
- Pivot quickly to misc, rev, or forensics when the challenge is only crypto-adjacent.

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

## Primitive Decision Tree

1. Is it RSA?
   - Check `n/e/c`, multiple ciphertexts, shared modulus, small exponent, close primes, leaked `dp/dq`, partial `p/q`, textbook RSA, common modulus, and padding misuse.
2. Is it ECC?
   - Check curve parameters, invalid curve, small subgroup, reused nonce, biased nonce, custom curve arithmetic, and signature nonce leakage.
3. Is it symmetric crypto?
   - Check mode, IV/nonce reuse, ECB patterns, CTR keystream reuse, CBC bit flipping, padding oracle, custom padding, and MAC-then-encrypt mistakes.
4. Is it a PRNG challenge?
   - Check LCG, MT19937, time seed, low entropy seed, modulo bias, partial output leakage, and state recovery.
5. Is it hash/MAC/signature logic?
   - Check length extension, weak compare, truncation, custom hash, HMAC misuse, and signature malleability.
6. Is it classical/encoding/compression?
   - Check XOR, known plaintext, repeated key, substitution, transposition, base encodings, compression, and layered transforms.

Pick the first branch supported by parameters or source. If a branch fails, record why before switching.

## When to Pivot

- If the challenge is actually protocol/client logic, hand off to `ctf-misc`.
- If the output depends on binary checker behavior or runtime validation, hand off to `ctf-rev`.
- If the artifact is embedded in a file/container, hand off to `ctf-forensics` after preserving the original.

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
