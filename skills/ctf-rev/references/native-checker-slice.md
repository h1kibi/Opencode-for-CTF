# Native Checker Slice

Use for ELF/PE/Mach-O crackmes or native validation binaries where the goal is to recover accepted input or a flag.

## Triggers

- Native executable with prompt, success/failure strings, or input validation.
- `strcmp`, `strncmp`, `memcmp`, `scanf`, `fgets`, `read`, crypto/hash imports, or custom compare loops.
- Flag format or partial fragments appear in strings.

## First Safe Checks

1. Run one artifact triage or `ctf-binary-probe`.
2. Find success/failure strings and xrefs.
3. Locate input boundary: argv, stdin, file, env, network, GUI, resource.
4. Walk from success/failure branch backward to the nearest checker.
5. Extract length checks, charset/range checks, constants, tables, and transform loops.
6. Rebuild the checker in `solve.py` before inverting if semantics are not obvious.

## Slice Table

| Address / Function | Role | Evidence | Controlled Input | Constants | Next Action |
|---|---|---|---|---|---|

## Semantics Checks

- Verify signedness and integer width.
- Verify byte order and indexing direction.
- Verify loop bounds and off-by-one behavior.
- Verify modulo/truncation behavior.
- Verify whether comparison is against transformed input or transformed constants.

## Solver Routes

- Direct compare: extract bytes/string.
- XOR/add/sub/rotate: invert per byte.
- Hash/rolling checksum: brute force constrained positions or use z3.
- Table/S-box: build inverse table if one-to-one.
- Branch constraints: collect path predicates and solve incrementally.

## Stop Rules

- After two broad decompiler passes, stop reading and use xrefs/trace.
- Do not manually solve long pseudocode before writing an executable checker.
- Do not trust decompiler arithmetic until disassembly confirms edge cases.

## Verification

Run the candidate through the binary/app when possible. If execution is unavailable, verify against exact reconstructed checker and document the missing runtime.
