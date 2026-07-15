# Encoding / Transform Chain

Use for layered encodings, custom transformations, puzzle files, and mixed text/binary decode chains.

## Triggers

- Suspicious base64/base32/base85/hex/binary/morse/braille/QR-like data.
- Repeated high-entropy or printable layers.
- Custom alphabet, substitution, transposition, XOR, Caesar/Vigenere-like hints.
- Challenge description suggests layers, pipeline, or reversible puzzle.

## First Safe Checks

1. Preserve original bytes and record hashes before transforming.
2. Identify representation: text, bytes, image/audio/doc container, archive, or mixed.
3. Check magic bytes after each decode step.
4. Maintain a transform ledger; every step must be reversible or justified.
5. Verify with flag format, file magic, readable text, checksum, or challenge oracle.

## Transform Ledger

| Step | Input Clue | Transform | Parameters | Output Signal | Reversible? |
|---|---|---|---|---|---|

## Common Families

- Base encodings: base64/base32/base58/base85/ascii85, with padding/URL-safe variants.
- Numeric encodings: hex, octal, binary, decimal ASCII, Unicode codepoints.
- Classical ciphers: Caesar, Vigenere, affine, substitution, transposition.
- Byte transforms: XOR single/repeating key, add/sub, rotate, bit reverse, endian swap.
- Containers: gzip/zlib/bzip2/xz/zip/tar/png/pdf/docx with embedded data.
- Visual/audio: QR/barcode, spectrogram, DTMF, Morse, LSB only when evidence exists.

## Stop Rules

- Do not run random decoders indefinitely; after 3 same-family failures, change representation or seek a new clue.
- Do not discard non-printable output before checking magic bytes.
- Do not assume base64 solely from alphabet; validate padding and decoded structure.
- Avoid destructive overwrites; write transformed outputs under `work/`.

## Solver Contract

Build a reproducible script for the final chain. The final script should load the original artifact/data and apply each transform in order until the verified flag or final artifact appears.
