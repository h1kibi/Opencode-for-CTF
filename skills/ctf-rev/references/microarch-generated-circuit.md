# Microarchitecture / Generated Circuit RE

Use this reference when a native RE challenge contains cache/timing or generated-circuit signals such as:

- `rdtsc`, `rdtscp`, `clflush`, `mfence`, `lfence`, `prefetch`, `rdrand`, `rdseed`, `cpuid` used near validation logic.
- Repeated helper calls around bit extraction, cache-line indexing, timing thresholds, or large generated functions.
- Many similar functions with input-bit reads, table/cache-line touches, and output bit reconstruction.

## Hard Rule

If `clflush` + `rdtsc/rdtscp` appears in the validation path, stop standard cipher guessing after one quick constants test. Treat the program as a microarchitecture-backed circuit until falsified.

Do **not** spend more than one quick pass on AES/SM4/hash/linear-oracle guesses before modeling the hardware primitive.

## Required Primitive Model

Before reading large generated blocks, write a compact model:

| Primitive | Address | Inputs | Memory Effect | Output / Oracle | Threshold | Notes |
|---|---:|---|---|---|---|---|
| touch / heat | | registers/pointers | which cache line or marker changes | none | n/a | |
| flush / clear | | address | clears line/state | none | n/a | |
| measure | | address | reads timing/state | hit/miss bit | e.g. `< 0xb5` | |

For each primitive, identify:

- argument registers and pointer levels;
- whether byte values select cache-line indices;
- whether code clears candidates using `mov [addr], 0` and/or `clflush`;
- how timing is converted into a bit (`cmp rax, imm; setb/seta/...`);
- where output bits are packed or compared.

## Software Emulation Patch Strategy

Goal: replace unstable hardware state with deterministic memory state while preserving upper-level code.

Typical patch shape:

```c
// touch/heat primitive replacement
void touch(uint8_t *selector_a, uint8_t *selector_b, uint8_t *table_a, uint8_t *table_b) {
    table_b[*selector_a + 0x100] = 1;
    table_a[*selector_b + 0x100] = 1;
}

// measure primitive replacement
uint64_t measure(uint8_t *addr) {
    return *addr ? 0 : 0x100; // preserves cmp rax, threshold; setb semantics
}
```

If the original code uses `mov [addr], 0` before `clflush`, that write can serve as the deterministic state clear. If not, add a state map or patch flush sites.

### Self-Test Handling

Many challenges contain an environment self-test using the same primitive. If the software model fails before the real checker:

1. Identify the self-test call from the error string/xref.
2. Bypass only the self-test return, not the checker.
3. Validate the software model against at least two real hardware oracle samples before trusting it.

## Validation of the Software Model

Before solving, compare against real execution:

- Patch only comparison output to expose transformed bytes, or hook `memcmp`/`bcmp`/SSE comparison.
- Collect 2-5 sample inputs from the real hardware path.
- Run the software-emulated binary/model on the same inputs.
- Continue only if outputs match exactly.

Example validation table:

| Input | Real Output | Software Output | Match |
|---|---|---|---|
| `A*16` | ... | ... | yes/no |
| `B*16` | ... | ... | yes/no |

## Generated Circuit Extraction

Once primitives are modeled:

1. Extract all callsites to touch/measure helpers.
2. Extract timing thresholds and `setcc` conversions.
3. Extract input-bit reads such as `[input+i] >> bit & 1`.
4. Extract output-bit packing / byte reconstruction.
5. Convert to an executable Python model or SAT constraints.

Do not manually read thousands of generated instructions without first extracting:

- helper call addresses;
- byte/bit extraction patterns;
- thresholds;
- output compare targets;
- loop/jump-table order.

## Oracle Budget

A hardware/black-box oracle is useful only for calibration.

Allowed without further justification:

- 2-5 samples: establish mapping shape.
- up to 128 samples: test linear/affine hypothesis.

After linear/affine and block decomposition fail, stop black-box sampling and return to primitive extraction/software emulation.

## Common Failure Signature

Failure: saw `clflush`/`rdtscp` but continued standard cipher guessing or black-box oracle sampling.

Correction:

1. Locate touch/measure primitives.
2. Software-emulate the primitives.
3. Bypass self-test only if necessary.
4. Validate against real oracle samples.
5. Trace/extract/SAT the deterministic model.
