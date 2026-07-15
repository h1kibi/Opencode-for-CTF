# closure-ssrf-internal

## Trigger
- SSRF/internal fetch or metadata/internal-route access is confirmed.

## Why it looks promising
- SSRF can expose source, config, debug panels, admin-only internal routes, metadata, or service-to-service pivots.

## What usually goes wrong
- The solver keeps enumerating protocols and hosts after SSRF has already solved the information problem.

## Better question
- Has SSRF already yielded enough source/config/runtime evidence to stop enumeration and switch to closure?

## First corrective probe
- If source/config/internal route evidence is already available, freeze protocol expansion and pivot to source-guided or internal admin route closure.

## Closure queue
1. direct internal flag/debug/config endpoint
2. source or local-only file path through the SSRF read path
3. internal admin route or metadata credential pivot
4. service discovery only if it materially narrows closure
5. one clean reproducible internal request skeleton

## Stop rule
- After source or config is already acquired, do not keep broad SSRF enumeration unless closure probes fail.

## Reuse query terms
- ssrf internal source config metadata admin route closure stop enumeration
