# Z3 Constraint Solver

Use when validation is a set of arithmetic, bit-vector, branch, checksum, or per-character constraints that are easier to solve symbolically than manually.

## Triggers

- Many equations over input bytes/chars.
- Length and charset constraints plus arithmetic checks.
- Rolling hash/checksum with limited input size.
- Branch-heavy checker where accepted path constraints can be collected.
- Nonlinear-looking code that is actually bit-vector arithmetic.

## First Safe Checks

1. Determine exact input length and byte/char domain.
2. Choose variable type: `BitVec(8)`, `Int`, or wider bit-vectors.
3. Encode width/truncation exactly; prefer bit-vectors for C-like overflow.
4. Add printable/flag-format constraints only when justified.
5. Encode checks incrementally and test satisfiability after small groups.
6. Verify model output against reconstructed checker or binary.

## Constraint Ledger

| Source Location | Constraint | Variable Width | Domain | Notes |
|---|---|---|---|---|

## Encoding Rules

- C unsigned byte arithmetic usually maps to `BitVec(8)` with explicit zero/sign extension when needed.
- C int overflow/truncation requires matching width, not Python unbounded integers.
- Use `RotateLeft`/`RotateRight` for rotations.
- Use `Extract`/`Concat` for byte packing/unpacking.
- For modulo printable constraints, encode as range constraints on concrete byte variables.

## Search Strategy

- Start with length/prefix/domain.
- Add high-confidence direct equations first.
- Check `sat` after each group.
- If `unsat`, binary-search the last added constraints.
- If too many models, add comparison/hash constraints or use optimizer/lexicographic filtering only if needed.

## Stop Rules

- Do not add guessed flag format constraints if the challenge format is unknown.
- Do not encode decompiler output blindly; verify width and signedness.
- If z3 is slow, split independent chunks, brute force small domains, or emulate forward with pruning.

## Verification

Always run the model candidate through the checker or original artifact when possible. A `sat` model is not a verified flag by itself.
