# Crypto Triage

Parameter inventory: modulus bit lengths, public exponent, ciphertext, nonce behavior, and oracle transcript recorded.
RSA inputs are normalized before any attack. ctf-rsa-probe selected the reversible-first path.
Stated weakness: specific RSA assumption broken by repeated prime structure.
Verification path: re-encrypt the recovered plaintext and verify challenge constraints.
Evidence: work/ctf-evidence/rsa/notes.md and solve.py.
