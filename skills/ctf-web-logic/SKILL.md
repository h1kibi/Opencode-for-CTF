---
name: ctf-web-logic
description: Use for authorized Web CTF challenges involving business logic flaws, order/payment/coupon/points manipulation, workflow state bypass, and integer overflow.
compatibility: opencode
---

# CTF Web Logic

## Purpose

Use when challenge involves business logic: purchasing, payments, coupons, points, inventory, order status, or multi-step workflows.

## Attack Surface

- Price manipulation (negative values, zero, front-end trust)
- Coupon/promo code logic (stacking, reuse, minimum order bypass)
- Points/balance overflow or negative transfer
- Order status jump (skip payment, cancel after delivery)
- Inventory bypass (order more than stock)
- Workflow state machine abuse

## Rules

- Draw the workflow state machine first.
- Test boundary values: 0, -1, MAX_INT, negative quantities.
- Test workflow skip: can you jump to a later state?
- Race conditions are a separate skill (`ctf-web-race`); route there if timing matters.
- Use minimal, reversible test transactions before full exploitation.

## Output Contract

```markdown
# Logic Map

| Workflow Step | Inputs | Validation | Bypass Candidate |
|---|---|---|---|
```
