# Custom VM Lifter

Use when a reverse challenge contains a dispatcher loop, bytecode blob, opcode table, handler array, virtual registers, or VMProtect-like instruction interpretation.

## Triggers

- Switch/dispatch loop over byte/opcode values.
- Large handler table, computed jumps, or indirect calls from opcode index.
- Separate bytecode/resource blob loaded before validation.
- Repeated state updates to virtual registers, stack, memory, or instruction pointer.

## First Safe Checks

1. Identify bytecode source, size, entry IP, and input injection point.
2. Identify VM state: registers, stack, memory, flags, IP, and output buffer.
3. Map dispatcher shape: fetch, decode, handler dispatch, IP update.
4. Label 3-5 high-frequency handlers from trace or xrefs before full deobfuscation.
5. Write a tiny disassembler or trace logger; do not manually read every handler first.

## VM Ledger

| Opcode | Handler | Operands | Semantics | State Read | State Write | Evidence |
|---|---|---|---|---|---|---|

## Solver Routes

- If VM bytecode computes a transformed flag: lift handlers to Python and emulate.
- If VM produces branch constraints: emit z3 constraints per instruction.
- If only final compare matters: hook compare/output and trace concrete execution.
- If bytecode is encrypted: locate decryptor and dump post-decrypt blob first.

## Stop Rules

- Do not fully decompile every handler before locating bytecode, state layout, and compare oracle.
- After two failed opcode guesses, run a concrete trace with one controlled input and compare state deltas.
- If VM handler semantics explode, lift only the validation slice that reaches final compare.
