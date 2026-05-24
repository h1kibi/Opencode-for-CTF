---
name: ctf-web-race
description: Use for authorized Web CTF challenges involving race conditions, TOCTOU, concurrent request abuse, one-time token reuse, or limit bypass via timing.
compatibility: opencode
---

# CTF Web Race

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
