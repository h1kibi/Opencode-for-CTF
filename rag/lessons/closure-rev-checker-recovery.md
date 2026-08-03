# closure-rev-checker-recovery

## Trigger
- Validation logic, transform chain, lookup tables, or checker semantics are recovered from a binary, script, class, or client artifact.

## Why it looks promising
- Once the checker is understood, the remaining task is usually solver completion or exact input reconstruction.

## What usually goes wrong
- The solver keeps reading more code instead of extracting the minimal variables needed to solve.

## Better question
- What exact unknowns still block reconstruction, and do I need more reversing or just a solver now?

## First corrective probe
- Convert the checker into a compact script or equation and verify one candidate or intermediate state.

## Closure queue
1. solver reconstruction
2. exact constant/table recovery
3. one candidate verification against the artifact
4. output formatting / flag wrapping
5. one clean solve script

## Stop rule
- Once the checker is modeled, more browsing is lower value than solver completion.
