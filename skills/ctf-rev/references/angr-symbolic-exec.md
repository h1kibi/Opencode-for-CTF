# angr Symbolic Execution

Use when a native binary has a clear success/failure address, path constraints are branch-heavy, and manual inversion is slower than symbolic exploration.

## Triggers

- Success and failure strings have known xrefs or addresses.
- Validation reads stdin/argv/file with bounded input length.
- Arithmetic/branch constraints dominate over opaque external state.
- No severe anti-symbolic behavior, self-modifying code, or unsupported syscall barrier on the checker path.

## First Safe Checks

1. Determine input channel and exact max length.
2. Locate `find` success address and `avoid` failure addresses.
3. Constrain bytes only with justified domains such as printable or known flag prefix.
4. Stub noisy functions with SimProcedures only when they are not semantically part of the checker.
5. Verify the model candidate against the original binary.

## angr Plan

| Input Channel | Length | Find | Avoid | Stubs | Constraints | Verification |
|---|---:|---:|---|---|---|---|

## Stop Rules

- Do not use angr before locating success/failure or a reliable target address.
- If path explosion occurs, narrow to checker function, add length/domain constraints, or switch to concrete trace + z3 slice.
- A satisfiable model is not a flag until the original artifact accepts it.
