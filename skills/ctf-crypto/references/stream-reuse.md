# Stream-Cipher and Keystream Reuse

Use for CTR/stream/custom XOR where a nonce/key/keystream is reused.

Record ciphertext/plaintext lengths, known prefixes, nonce behavior, and message alignment. Use `C1 xor C2 = P1 xor P2` only when reuse is established; validate a recovered keystream on an unused region and preserve encoding boundaries.

