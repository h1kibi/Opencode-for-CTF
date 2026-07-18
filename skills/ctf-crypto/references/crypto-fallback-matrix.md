# Crypto Fallback Matrix

Use this when a crypto branch stalls. Pick exactly one fallback that improves the parameter inventory, oracle model, or verification path.

| Failed Stage | Symptom | Fallback | Stop / Pivot Rule |
|---|---|---|---|
| Primitive ID | Challenge shape unclear | Normalize bytes/ints/encodings, list all parameters, and classify by RSA / ECC / symmetric / PRNG / hash-signature / classical | If it is not crypto-shaped after normalization, route to misc/rev/forensics |
| RSA Route | RSA attack family fails | Re-check modulus sharing, small exponent, CRT leaks, padding behavior, and protocol/oracle interaction before changing families | Do not brute force ciphertext/plaintext space |
| ECC / Signature Route | Curve math or nonce route unclear | Extract curve/domain params, subgroup/order, nonce evidence, and signature reuse conditions before algebra | If the challenge is really app logic or parsing, route to web/misc |
| Symmetric Route | Mode attack stalls | Lock mode, IV/nonce rules, padding, and block layout; test reversible bitflip/keystream hypotheses first | Do not treat unknown ciphertext as random brute force fodder |
| PRNG Route | State recovery unclear | Count samples, output widths, truncation, modulo bias, seed bounds, and reproducibility before solver work | If outputs are actually transformed strings/files, route to misc |
| Classical / Encoding Route | Multi-layer transform unclear | Build a reversible chain one layer at a time, verifying every decode or transform | Stop after two unsupported guesses; require evidence before a third transform family |
| Oracle / Protocol Route | Online behavior inconsistent | Record exact request/response transcript, error classes, timing, and determinism before coding attacks | If the service behavior is mostly protocol/client logic, route to misc or web |
| Verification | Candidate plaintext/key/signature not accepted | Re-check endianness, integer/byte conversions, newline/wrapper format, and exact verifier constraints | Do not guess final flags without deterministic validation |

High-information fallbacks:

- Parameter inventory beats early coding.
- Reversible transforms beat bounded brute force.
- Oracle transcript discipline beats speculative math.
- Re-encryption / re-verification beats eyeballing plaintext.
