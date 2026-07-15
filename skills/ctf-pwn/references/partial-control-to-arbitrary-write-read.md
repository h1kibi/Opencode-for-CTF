# Partial Control to Arbitrary Read/Write

Use when the challenge shows partial overwrite, constrained write, off-by-one, format-string limited write, heap metadata control, or object-field corruption.

## First Signals

- Low-byte or two-byte overwrite.
- Saved RIP partially controlled.
- GOT/function pointer partially controlled.
- Format string has limited `%hn`/`%hhn` viability.
- Heap fd/bk or object field partly controlled.
- Length/integer bug gives bounded overwrite.

## Reduction Questions

| Question | Why it matters |
|---|---|
| Which bytes are controlled? | Determines PIE/ASLR feasibility |
| Is target stable across runs? | Remote reliability |
| Is overwrite one-shot or repeatable? | Multi-stage feasibility |
| Can the primitive be upgraded? | Read/write/control chain |
| What addresses share high bytes? | Partial pointer redirection |
| Is there a leak? | Turns partial into precise control |

## Upgrade Paths

- Partial RIP -> nearby win/gadget if PIE off or high bytes stable.
- Partial GOT/function pointer -> PLT-compatible redirect when RELRO allows.
- Partial heap pointer -> overlap or controlled allocation when safe-linking handled.
- Bounded stack overwrite -> ROP suffix if canary preserved and return slot reached.
- Format `%hhn/%hn` -> staged arbitrary write when offset and target are stable.

## False Positives

- Crashing at a near address is not reliable control.
- Partial overwrite under PIE without leak is usually probabilistic.
- `%hhn` writeability does not imply arbitrary write without target stability and byte count control.

## First Safe Probes

1. Measure exact controlled bytes and offset.
2. Repeat five times locally to check stability.
3. Classify target address region.
4. Seek one leak if high bytes are unknown.
5. Prefer local deterministic exploit before remote attempts.

## Stop / Pivot Rule

If the primitive remains probabilistic after two stabilization attempts and no leak exists, demote it unless the challenge clearly has a fork/bruteforce oracle.

## Query Terms

partial overwrite PIE pwn, hhn arbitrary write, off by one saved rip, partial pointer overwrite heap, constrained write primitive upgrade
