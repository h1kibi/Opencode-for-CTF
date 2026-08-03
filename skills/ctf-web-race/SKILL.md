---
name: ctf-web-race
description: Use for authorized Web CTF challenges involving race conditions, TOCTOU, concurrent request abuse, one-time token reuse, or limit bypass via timing.
compatibility: opencode
---

# CTF Web Race

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

Load after `ctf-web` focused-probe selects a matching race signal; do not use it for generic Web recon.

## Purpose

Use when challenge involves race conditions: one-time token reuse, coupon/limit double-spend, concurrent state changes, or TOCTOU vulnerabilities.

## Signals

- One-time tokens or codes
- Rate limits or use counters
- Inventory-limited items
- Sequential state transitions
- File operations with TOCTOU potential

## Rules

- Race is the last candidate to try, not the first.
- Only enable concurrency when attack-queue explicitly selects race as the top candidate.
- Test with 2-5 concurrent requests first, not 50+.
- Use precise timing: send requests as close together as possible.
- If one-time token is involved, test if it can be reused in a short window.
- Record whether concurrency succeeded before escalating.

## Output Contract

```markdown
# Race Map

| Race Target | Concurrent Window | Request Count | Result |
|---|---|---|---|
```
