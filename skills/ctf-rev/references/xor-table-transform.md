# XOR / Table Transform

Use when validation applies byte-wise transforms, lookup tables, S-boxes, or encoded constants.

## Triggers

- Hex/byte arrays in rodata/resources.
- Loops using `xor`, `add`, `sub`, `rol`, `ror`, `shl`, `shr`, modulo, or index-dependent keys.
- Lookup tables, S-boxes, base encodings, or shuffled alphabets.
- Comparison against transformed input or transformed constants.

## First Safe Checks

1. Extract all candidate arrays with offsets and lengths.
2. Identify input length and loop count.
3. Determine transform direction:
   - input -> transform -> compare constant
   - constant -> transform -> compare input
   - both sides transformed
4. Recreate the transform exactly in `solve.py`.
5. Test known fragments such as flag prefix if available.

## Transform Ledger

| Stage | Operation | Key/Table | Index Rule | Width / Modulo | Invertible? |
|---|---|---|---|---|---|

## Common Inversions

- `out = in ^ key` -> `in = out ^ key`
- `out = (in + k) & 0xff` -> `in = (out - k) & 0xff`
- `out = rol(in, r)` -> `in = ror(out, r)`
- table substitution -> inverse map if values are unique
- permutation/shuffle -> inverse permutation
- cumulative state -> solve forward/backward with known initial state

## Evidence Requirements

- Exact constants/tables copied into solver.
- Width and modulo behavior encoded explicitly.
- Loop bounds match binary.
- Candidate output verifies against checker or binary.

## Stop Rules

- Do not assume every array is the target; prove xref into checker.
- Do not mix decimal/hex/signed interpretations without checking width.
- After 3 failed inverse attempts, build forward checker and compare intermediate states against a trace or small test input.
