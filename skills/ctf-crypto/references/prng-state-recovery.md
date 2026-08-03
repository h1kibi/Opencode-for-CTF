# PRNG and State-Recovery Reference

Use when outputs depend on LCG, MT19937, time/low-entropy seeds, modulo bias, or partial state leakage.

## Inventory

Record generator, output transformation, number of observations, truncation, seed bounds, and whether outputs are consecutive or interleaved.

## Route

- LCG: derive equations from consecutive outputs; solve modulus/multiplier/increment only when observations support it.
- MT19937: distinguish full words, truncated outputs, tempering inversion, and state length before collecting observations.
- time/low entropy: bound timezone/clock/seed source from challenge data before enumeration.
- partial outputs: model missing bits and use constraints/SAT only after a deterministic relation is written.

Verify recovered state by predicting an unused sample. Do not call a seed recovered from matching one output.

