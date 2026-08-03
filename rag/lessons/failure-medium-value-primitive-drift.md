# failure-medium-value-primitive-drift

## Trigger
- Reflection, weak XSS, open redirect, CRLF, UI-only state changes, or other medium-value phenomena keep receiving probe budget.

## Why it looks promising
- It produces visible differentials and feels interactive.

## Misleading signal
- The branch shows activity, but not progress toward flag/source/database/privileged state.

## Earlier kill signal
- Two same-family probes produced no tighter path to source, secret, admin, DB, file read, or stronger primitive.

## Better next probe
- Switch to the cheapest high-value branch: source/data surface, parser mismatch with a real sink, authz/state, or closure of an existing primitive.

## Stop rule
- Medium-value branches need a two-step route to flag/source/database/privileged state or they are downgraded.
