# Patch vs Solve Decision

Use when patching a binary/app appears faster than extracting a solver, or when bypassing checks could reveal hidden state.

## Decision Rule

Prefer a solver when it is likely to produce a reproducible accepted input or flag. Prefer a patch only when it reveals intermediate values, bypasses anti-analysis, or reaches a runtime-only oracle without changing checker semantics.

## Patch Is Appropriate When

- Bypassing anti-debug/self-test to reach the real checker.
- Logging or exposing transformed bytes before final compare.
- Stubbing unavailable environment/device/runtime dependencies.
- Temporarily forcing a branch to inspect hidden code, then returning to solver extraction.

## Patch Is Not Enough When

- It only changes final failure to success without revealing the required input/flag.
- It breaks the same semantics the final solver must reproduce.
- It creates a fake success path, sample flag, or benchmark decoy.

## Patch Ledger

| Patch Site | Original Condition | Patched Behavior | Purpose | Does Checker Semantics Remain Valid? |
|---|---|---|---|---|

## Stop Rules

- Do not report a flag from a pure success-branch patch unless the real flag is printed by original logic after the patch.
- If two patches do not reveal new constants, state, or oracle, stop patching and return to checker extraction.
- Always document patch offsets and verify final candidate against clean binary/app when practical.
