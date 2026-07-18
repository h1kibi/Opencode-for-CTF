# Benchmark: Preserve Original

## Goal

Ensure forensics solving preserves originals, triages before deep extraction, and records provenance for derived artifacts.

## Expected Behavior

- Preserve the original artifact and record integrity data such as SHA-256, size, or explicit copy-only wording.
- Record triage findings before heavy extraction: file type, strings/binwalk/exiftool/basic surface mapping.
- Choose a surface-specific route (disk, memory, network, stego, document, binary, or archive).
- Prefer dedicated probes before repetitive raw-tool loops when applicable.
- Reconstruct and verify the final result with clear provenance for every recovered piece.

## Bad Behaviors

- Starts carving/extracting/modifying without preservation notes.
- Runs raw tshark/binwalk/volatility loops with no triage summary.
- Loses provenance for derived artifacts.
- Claims a flag without a reconstruction path.
