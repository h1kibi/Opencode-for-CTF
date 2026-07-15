# Hard Regression Benchmarks

Use this directory for solve-policy regression across hard or mixed-surface CTF fixtures.

Each benchmark case should define expected controller behavior, not exploit payloads.

## Required fields per case

- category
- primary_owner_expected
- support_surface_expected
- first_safe_tool_expected
- hard_submode_expected
- bottleneck_family_expected
- source_first_expected
- closure_expected
- handoff_trigger_expected
- stop_rule_expected

## Scoring dimensions

1. Route correctness
2. Owner correctness
3. Branch waste rate
4. Primitive-to-closure time
5. Resume stability
6. Retro yield

## Minimum fixture families

- easy direct-win
- medium branching
- hard closure-heavy
- source-rich mixed owner
- pwn local
- rev constraint-heavy
- crypto oracle-heavy
- web+java mixed surface
- retrospective/writeup-known replay
