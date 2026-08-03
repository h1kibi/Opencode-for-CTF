---
name: ctf-web-logic
description: Use for authorized Web CTF challenges involving business logic flaws, order/payment/coupon/points manipulation, workflow state bypass, and integer overflow.
compatibility: opencode
---

# CTF Web Logic

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching logic signal; do not use it for generic Web recon.

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
