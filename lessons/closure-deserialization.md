# closure-deserialization

## Trigger
- A deserialization sink, gadget chain, stream marker, or equivalent object-reconstruction primitive is confirmed.

## Why it looks promising
- Deserialization often directly yields file read, file write, method invocation, template control, or code execution.

## What usually goes wrong
- The solver keeps looking for more gadget families instead of closing the already-known sink.

## Better question
- What is the cheapest confirmed gadget effect that gets me to read/write/privileged state with the current sink?

## First corrective probe
- Model the current sink as a concrete primitive: read, write, invoke, render, or trigger; then rank closure adapters before discovering new families.

## Closure queue
1. direct read helper or source/config disclosure
2. file write / include / render adapter
3. privileged state or role path
4. code-execution only if read/flag path is weaker
5. one minimal replay chain

## Stop rule
- Do not keep gadget hunting when one confirmed gadget already composes into a strong closure path.
