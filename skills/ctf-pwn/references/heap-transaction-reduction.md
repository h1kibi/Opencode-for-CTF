# Heap Transaction Reduction

## Purpose
Convert menu/game/inventory actions into allocator transitions so the solver can stop guessing at the business-logic layer.

## Trigger
- repeated buy/use/sell/add/remove/consume actions
- heap/UAF suspicion
- stale display, stale consumer, or repeated refill opportunity

## Required output
| Step | Action | malloc/free | Size Class | Object / Field | Reused Chunk | Visible Effect |
|---|---|---|---:|---|---|---|

## Minimal questions
- which action allocates?
- which action frees?
- what size class is likely involved?
- which stale reference still points to the freed chunk?
- which later action refills the same size class?
- which consumer turns that refill into read or write?

## Reduction order
1. write the transaction table
2. identify same-size refill opportunities
3. classify any leak from freed chunk contents
4. identify first object-field overwrite or stale consumer pivot
5. promote into AAR/AAW or demote the branch

## Good evidence
- allocator breakpoint log
- same-size rebuy causing changed stale output
- stable pointer-shaped leak after free
- display order differing from allocation order

## Avoid
- continuing high-level UI/consumer probing if it does not change allocator knowledge
- naming a final heap technique before the transaction table explains the stale/refill relationship
- treating repeated buy/use noise as progress when no size class or refill fact changed

## Stop rule
If two high-level actions do not improve allocation/free/reuse knowledge, stop consumer probing and switch to lifecycle or size-class confirmation.
