# C++ Object / Inventory UAF Playbook

## Trigger
- inventory / shop / equipment / item description UI
- consume/use/sell/remove stale state
- C++ wrapper objects, shared_ptr-like ownership, or name/description fields

## Purpose
Convert high-level game or inventory symptoms into an object-field and heap-lifecycle model quickly.

## First questions
- Is UI/display order different from allocation order?
- Are `name` and `description` separately allocated?
- Is there a wrapper object and an inner object?
- Which action frees the inner object or one of its heap fields?
- Which stale consumer still prints or uses the freed field?
- Does rename/edit/new-name input cross an object-field boundary?
- Which object can be rebought to refill the same size class?
- Does the consumer print field contents or dereference a pointer to those contents?

## Required tables

### Object Field Table
| Object | Field | Approx Offset | Allocation Owner | Consumer | Controllable? |
|---|---|---:|---|---|---|

### Lifecycle Table
| Action | malloc/free | Size Class | Object / Field | Stale Refs | Output Oracle |
|---|---|---:|---|---|---|

## Reduction priorities
1. confirm stale display or stale use path
2. classify which heap field is stale
3. confirm same-size refill candidate
4. confirm field overwrite or pointer overwrite
5. promote stale pointer consumer into AAR/AAW
6. only then choose FSOP/ORW/data-only closure

## Good probes
- compare display order vs buy order
- confirm `name` edit length vs adjacent pointer field
- rebuy same-size object after free and re-check stale consumer
- dump object-adjacent memory under gdb or structured snapshot

## Avoid
- staying in high-level business-logic probing after allocator evidence is already sufficient
- naming heap techniques before object field, size class, and refill sequence are known
- treating stale UI output as an endpoint instead of a stale pointer consumer

## Stop rule
If stale reference + pointer-shaped leak + repeated allocator actions are all present, stop broad consumer guessing until object model, stale owner, and refill path are written down.
