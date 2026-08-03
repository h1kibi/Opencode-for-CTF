# Custom VM / Bytecode Dispatcher Workflow

Local workflow card for challenges with custom virtual machines: dispatcher loop, opcode table, bytecode blob, handler array, virtual registers.

## Triggers
- `switch`/`if-else` chain over byte/word values in a loop
- Large handler table, computed jumps, indirect calls from opcode index
- Separate bytecode/resource blob loaded before validation
- Repeated state updates to virtual registers, stack, memory, or instruction pointer
- `run_vm`, `execute`, `dispatch`, `handler`, `opcode` symbols/strings

## First Safe Checks

1. Identify bytecode source (embedded `.rodata`/`.data`/resource/separate file), size, entry IP
2. Identify VM state: registers (count + width), stack, memory, flags, IP, output buffer
3. Map dispatcher shape: fetch → decode → handler dispatch → IP update
4. Label 3-5 high-frequency handlers from trace or xrefs before full deobfuscation
5. Write a tiny disassembler or trace logger; do not manually read every handler first

## Workflow Card

| Stage | Action | Tool |
|---|---|---|
| Identify | Find dispatcher loop + bytecode blob | `ctf-elf-slice keyword=dispatch\|opcode\|handler` |
| State map | Map registers/stack/memory layout | ReVa `get-decompilation` on dispatcher |
| Handler trace | Label top handlers by frequency | Frida hook or `ctf-rev-live-memory-dump` |
| Disassembler | Write tiny bytecode disassembler | python3 in revlab container |
| Solver | Lift handlers to Python; emulate or z3 | python3 + z3-solver |

## Handler Classification Quick Reference

Common handler patterns:
```
case 1: *R[op1] *= op2;      // MUL
case 2: *R[op1] -= op2;      // SUB
case 3: *R[op1] = ~*R[op1];  // NOT
case 4: *R[op1] ^= mem[op2]; // XOR
case 5: *R[op1] = *R[op2];   // MOV
case 7: if (R0) IP += op1;   // JNZ
case 8: putc(R0);            // PRINT
case 10: R0 = getc();        // INPUT
```

RVA-based dispatching: opcodes are RVAs pointing to handler functions; follow RVA chain.
State machine VMs (90K+ states): BFS for valid path.

## Solver Routes

- **VM computes transformed flag**: lift handlers to Python, emulate forward with known input, compare output
- **VM produces branch constraints**: emit z3 constraints per instruction, solve
- **Only final compare matters**: hook compare/output, trace concrete execution
- **Bytecode encrypted**: locate decryptor, dump post-decrypt blob with `ctf-rev-live-memory-dump`, then analyze

## Stop Rules

- Do not fully decompile every handler before locating bytecode, state layout, and compare oracle
- After 2 failed opcode guesses → run concrete trace with one controlled input, compare state deltas
- If VM handler semantics explode → lift only the validation slice that reaches final compare
- If bytecode is encrypted and decryptor is complex → dump post-decrypt blob, don't reverse decryptor

## Falsifier

- If no bytecode blob found → maybe not a VM; check if "dispatcher" is just a regular switch statement
- If handlers are trivial (MOV/JMP only) → likely obfuscation, not computation; switch to `packed-unpack-workflow.md`
- If state space is small (< 256 states) → may be solvable by BFS without full handler analysis

## Recommended Tools

```bash
# Identify VM structure
ctf-elf-slice target=<binary> keyword="dispatch\|opcode\|handler\|vm\|run"

# Trace handlers dynamically
ctf-rev-live-memory-dump target=<binary> marker="VM_START" dumpStart=0x404000 dumpSize=0x2000

# Build disassembler + solver in container
docker run --rm -v ./:/work revlab:ubuntu22.04 python3 /work/vm_solver.py
```

## Reference

- `skills/ctf-rev/references/custom-vm-lifter.md` — full doctrine
- `skills-external/ctf-skills/ctf-reverse/patterns.md` — Custom VM Reversing section
