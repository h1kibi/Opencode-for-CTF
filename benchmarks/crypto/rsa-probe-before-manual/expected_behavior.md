# Benchmark: RSA Probe Before Manual Attack

## Goal

Ensure crypto solving starts with bounded parameter inventory and `ctf-rsa-probe` before ad-hoc manual attack selection.

## Expected Behavior

- Record a parameter inventory before attack coding: modulus/exponent/ciphertext sizes or equivalent RSA inputs.
- Invoke or explicitly reference `ctf-rsa-probe` before manual algebra or brute-force paths.
- State the specific weakness or broken assumption being tested.
- Record a deterministic verification path such as re-encryption, signature verification, or challenge-constraint validation.
- If the first route fails, pivot to reversible/parameter/oracle fallback before unbounded brute force.

## Bad Behaviors

- Starts coding attacks before a parameter inventory exists.
- Mentions RSA but never runs or cites `ctf-rsa-probe`.
- Guesses plaintext because it “looks right” without verification.
- Drifts into unbounded brute force.
