# Browser, JIT, and Custom VM PWN Routing Card

Use when evidence contains JavaScript engine, browser runtime, JIT compiler, wasm, bytecode VM, interpreter type tags, addrof/fakeobj, OOB array, RWX JIT pages, GC, slices/views/aliases, dispatch tables, or emulator/sandbox language primitives.

Imported references:
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\advanced-exploits.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\advanced-exploits-2.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\advanced-exploits-3.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\advanced-exploits-4.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\sandbox-escape.md`

## Route Gate

Classify the engine first:

| Signal | Route pressure |
|---|---|
| JS/V8/JSC/SpiderMonkey | addrof/fakeobj, OOB array, map/type confusion, wasm RWX |
| BF/JIT/custom compiler | codegen bug, RWX tape/page, unbalanced stack state |
| bytecode VM/interpreter | signed bounds, dispatch table, type confusion, GC/lifetime |
| emulator/sandbox | opcode parser, memory bounds, host call bridge |
| wasm | linear memory OOB, imported function table, RWX/JIT bridge |

## Primitive Ladder

1. Understand object/value layout or VM state model.
2. Prove controlled OOB read/write, type confusion, dispatch redirection, or RWX write.
3. Obtain pointer leak or stable code/data base if ASLR applies.
4. Upgrade to addrof/fakeobj or arbitrary read/write.
5. Identify code execution closure: wasm RWX, JIT page, function pointer table, fake object method call, or host bridge.
6. Prefer direct flag read if the VM has file/syscall opcodes or host helper functions.

## First Safe Checks

- Build a minimal harness that repeats the suspicious operation without exploit payload noise.
- Print/compare object addresses, lengths, type tags, and backing stores if introspection is available.
- For custom VMs, map opcode format, bounds checks, data area, call/dispatch table, and host functions.
- For JIT, distinguish interpreter bug from generated-code bug; dump or log generated code only after a minimal trigger is known.

## Common Patterns to Recognize

- Signed upper-bound check without lower-bound check -> negative index into function table or VM memory.
- Slice/view/alias freed by GC while parent remains alive -> deterministic UAF overlap.
- JIT bracket/control-stack imbalance -> jump into RWX buffer.
- uint16/int truncation in jump offset or bytecode validator -> verifier/runtime desync.
- Dispatch table null-check before bounds check -> OOB call to nearby pointer/gadget.
- Neural/model output used as function-pointer index -> data-model parameters become control-flow input.

## Closure Preference

1. Existing `win`/flag host function via dispatch index or type confusion.
2. Write shellcode into RWX JIT/wasm/tape page and jump.
3. addrof/fakeobj -> arbitrary read/write -> function pointer/vtable/code pointer.
4. Data-only output path: overwrite path/string/length/print callback to disclose flag.
5. Shell only if direct flag read/output path is blocked.

## Hard Brakes

- Do not import browser-engine assumptions into a small custom VM without layout evidence.
- Do not skip object-layout proof; one successful crash is not addrof/fakeobj.
- Do not brute-force JIT payloads without a stable generated-code oracle.
- If the primary task is understanding VM semantics, hand off/support with `ctf-rev` before continuing pwn closure.
