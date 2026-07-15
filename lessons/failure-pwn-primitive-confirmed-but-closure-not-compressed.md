# failure-pwn-primitive-confirmed-but-closure-not-compressed

## Trigger
- A high-value PWN primitive is confirmed.
- The next probes keep expanding exploit capability instead of selecting the shortest flag path.
- The branch starts discussing heavier control-flow or object-graph ideas while a simpler read or data-only closure family still exists.

## Why it looks promising
- The primitive feels strong enough that more capability exploration seems useful.
- Extra `%n`, control-flow, heap-shape, or object-graph work can look like forward progress.

## What usually goes wrong
- The solver keeps proving what else is possible instead of compressing the primitive into the shortest closure family.
- Read-closure or data-only closure stays viable, but the branch drifts into heavier control-flow or post-exploit ideas.
- Fast-mode time is consumed without either a solve or a clean handoff.

## Better question
- Given the primitive already confirmed, what is the shortest closure family still alive right now?

## First corrective probe
- Write a compact closure card: primitive, shortest closure family, why not the others, and the next 3 probes only.
- If a higher-priority read closure is still viable, spend the next probe on that family instead of a heavier control-flow family.

## Stop rule
- After a confirmed primitive, if two probes in a row do not shorten the active closure path, rerank or hand off.

## Reuse query terms
- pwn primitive confirmed closure not compressed
- arbitrary read but no shortest closure
- fmt leak got libc heap buffer secret read
- stack secret cleared promote heap file buffer
