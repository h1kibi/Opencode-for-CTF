# failure-pwn-uaf-phenomenon-not-heap-primitive

## Trigger
- UAF / stale reference is observed.
- A pointer-shaped leak exists.
- Repeated allocator actions such as buy/use/sell/add/remove/rebuy are available.

## Why it looks promising
- The stale display or stale consumer keeps producing visible output, so continued business-logic probing feels productive.

## What usually goes wrong
- The solver keeps validating UI / consumer differences instead of switching to chunk lifecycle reduction.
- Heap technique naming is delayed because allocator evidence is not organized.
- The branch spends too long on phenomenon confirmation and never reaches refill / AAR / AAW.

## Better question
- Which freed chunk is still referenced, which action refills it, and which field becomes the first AAR/AAW pivot?

## First corrective probe
- Build a Heap Reduction Card and run one same-size refill test.

## Stop rule
- If UAF + leak + repeated allocator actions are all present, stop broad consumer probing until size class, stale owner, and refill candidate are written down.

## Reuse query terms
- uaf stale reference heap reduction
- stale display freed chunk refill
- ctf heap phenomenon not primitive
