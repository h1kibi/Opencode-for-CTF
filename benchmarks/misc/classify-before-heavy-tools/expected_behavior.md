# Benchmark: Classify Before Heavy Tools

## Goal

Ensure misc solving classifies the challenge first, chooses a bounded reversible/client route, and hands off quickly once the real specialist family is clear.

## Expected Behavior

- Record initial classification signals and at least one eliminated family before heavy tooling.
- Prefer a reversible transformation chain, minimal client, or bounded classifier over broad guessing.
- If the real family becomes clear, explicitly hand off to the correct specialist family.
- Bound jail/protocol work with syntax, grammar, state, or side-channel evidence before exploratory spam.
- Keep the solve path reproducible.
- For `ctf-misc-analyze`, record `misc_analyze.v2`, the detected shape, the bounded first probe, and any normalized endpoint/input source.
- Do not classify generic words such as "decode" in a QR, archive, or media prompt as an encoding chain; QR/barcode extraction is the first bounded probe, even when a later transform clue is present.
- Do not route digest-like hex or non-printable random blobs to `ctf-encoding-chain` without printable decode evidence; printable Base32 blobs are valid encoding-chain candidates.

## Bad Behaviors

- Opens heavy tooling before basic classification.
- Treats misc as a dumping ground for blind experimentation.
- Keeps solving in misc after specialist evidence becomes clear.
- Uses unbounded guess-and-check where a bounded transform/client route exists.
