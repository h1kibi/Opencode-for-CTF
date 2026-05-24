# RSA Reference

Use this reference for authorized crypto CTF challenges involving RSA parameters, ciphertexts, signatures, or RSA-like custom protocols.

## First Pass

1. Run `ctf-rsa-probe` on files or copied parameter text.
2. Parse all integers with explicit base and endian assumptions.
3. Record counts and bit lengths for `n`, `e`, `c`, `p`, `q`, `d`, `dp`, `dq`, and signatures.
4. Check whether the challenge is encryption, signing, oracle interaction, or key recovery.

## Weakness Checklist

- Shared prime: compute pairwise `gcd(n_i, n_j)` across moduli.
- Low exponent: for `e = 3` or small `e`, test small-message and Hastad broadcast conditions.
- Common modulus: if same `n` with coprime exponents, combine ciphertexts with extended gcd.
- Textbook RSA: no padding allows multiplicative attacks and direct root checks.
- Close primes: try Fermat when `p` and `q` are close.
- Leaked CRT: use `dp`, `dq`, or partial `p/q` leaks to recover factors.
- Small private exponent: consider Wiener or Boneh-Durfee depending on bounds.
- Padding oracle: separate protocol evidence from local math attacks.

## Implementation Notes

- Use exact integer arithmetic.
- Use `Crypto.Util.number.long_to_bytes` or equivalent only after validating plaintext range.
- For roots, verify by re-encrypting or checking `m ** e == c` before accepting.
- For lattice attacks, build a toy instance before running Sage on challenge parameters.

## Evidence To Record

- Parsed parameters and bit lengths.
- The specific RSA assumption broken.
- Factorization, recovered exponent, plaintext, or forged signature validation.
- Why discarded RSA attack families do not apply.
