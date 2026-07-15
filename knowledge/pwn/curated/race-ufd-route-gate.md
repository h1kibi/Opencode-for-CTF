# Race / userfaultfd Route Gate

## Trigger

Use this card when the branch depends on races, threads, signals, fork behavior, refcount issues, or `userfaultfd` timing.

## First Safe Check

1. Confirm the race surface and the shared object/state.
2. Identify one measurable oracle: state inversion, refcount imbalance, stale reuse, or timing differential.
3. Decide whether a deterministic non-race route still exists and is shorter.

## Route Pressure

- Promote reproducible oracle design over broad exploit scripting.
- Demote normal single-thread memory-corruption assumptions unless already proven.

## Stop Rule

If you cannot state the race window and one oracle, do not keep mutating payloads.
