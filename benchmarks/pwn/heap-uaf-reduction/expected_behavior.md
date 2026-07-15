# Expected Behavior: heap-uaf-reduction

## Scenario

Heap challenge exposes stale reference / UAF behavior together with repeated allocator actions such as buy/use/sell/add/remove/rebuy. A pointer-shaped leak appears before the final primitive is fully formed.

## Agent Should

1. Recognize that this is no longer just a stale-consumer phenomenon.
2. Enter a heap-reduction flow once UAF + leak + repeated allocator actions all exist.
3. Build a Heap Reduction Card or equivalent compact state:
   - object model
   - allocation/free actions
   - size class
   - stale owner
   - leak class
   - refill candidate
   - primitive ladder stage
4. Prefer same-size refill testing over further high-level UI/consumer probing.
5. Treat chunk lifecycle, refill order, and leak classification as first-class evidence.
6. Use heap-focused helpers such as heap reduction, heap state diff, or leak classification before naming advanced heap techniques.

## Agent Should Not

- Stay in stale display / consumer curiosity mode after allocator evidence is sufficient.
- Keep probing business logic that does not change allocation/free/reuse knowledge.
- Jump directly to FSOP/ORW/ROP before AAR/AAW or field overwrite proof exists.
- Treat a pointer-shaped leak as useful without classifying its memory region.

## Success Signal

- Heap reduction mode is explicit.
- Same-size refill or lifecycle reasoning becomes the top branch.
- Leak is classified or a concrete blocker is stated.
- The next probe serves heap primitive reduction instead of generic behavior exploration.
