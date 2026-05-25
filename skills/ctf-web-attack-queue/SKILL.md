---
name: ctf-web-attack-queue
description: Use after recon to score and prioritize the attack surface. Prevents the agent from drilling into the first vulnerability it sees by ranking candidates on Value, Cost, Risk, Stability, and Confidence.
compatibility: opencode
---

# CTF Web Attack Queue

## Purpose

After recon provides a surface map, score each candidate attack path and choose the highest-value, lowest-cost, lowest-risk direction first. Do not pursue the first visible vulnerability just because it appeared first.

## Scoring System

### Value (1-5)

- 5 = likely RCE, arbitrary file read/write, admin session, direct flag access
- 4 = strong auth bypass, SSRF to internal admin/debug, SQL data read/write
- 3 = stored XSS with bot, upload control, template injection, IDOR with sensitive data
- 2 = reflected XSS, weak info leak, minor session issue
- 1 = cosmetic or uncertain behavior

### Cost (1-5)

- 1 = one request or obvious source proof
- 2 = small script or 2-3 requests
- 3 = needs auth flow, browser, or multi-step setup
- 4 = needs many payloads, timing, race, or environment tuning
- 5 = brute force, broad scan, fragile browser/bot chain

### Risk (1-5)

- 1 = read-only
- 2 = harmless canary or reversible state change
- 3 = writes user-controlled content
- 4 = overwrites files, triggers bot repeatedly, or mutates backend state
- 5 = may crash, deadlock, corrupt, restart, or lock out the instance

### Stability (1-5)

- 5 = deterministic local/source-backed path
- 4 = stable backend/admin/database surface
- 3 = browser/bot but reproducible
- 2 = timing/blind behavior
- 1 = flaky or environment-sensitive

### Confidence (1-5)

- 5 = source code confirms the sink and reachable input
- 4 = strong behavioral evidence (error, timing, response difference)
- 3 = weak evidence but high-value context (known framework, common pattern)
- 2 = speculative based on parameter name or framework alone
- 1 = guess without evidence

## Score Formula

`Score = Value + Confidence + Stability - Cost - Risk`

## Decision Rules

- Try the highest-score low-risk candidate first.
- Prefer short, high-value, source-backed checks.
- Delay expensive or destructive candidates until safer high-value paths are exhausted.
- Do not choose a lower-score candidate just because it was discovered first.
- If two candidates have the same score, prefer the one with lower risk.

## Pattern-Enriched Ranking

If a candidate has strong signals but unclear technique, call `ctf-web-pattern-search` with the observed signals.

For each matched pattern, update the queue:

| Candidate | Matched Pattern | Expected Primitive | Value | Cost | Risk | Confidence Change | First Safe Check |
|---|---|---|---:|---:|---:|---:|---:|---|

Confidence rules:

- Increase confidence only when the pattern matches observed evidence.
- Do not increase confidence for generic payload lists.
- Do not rank destructive patterns above safe source-backed checks unless the expected primitive is critical and evidence is strong.

## Output Contract

Write this to `notes.md`:

```markdown
# Attack Queue

| Candidate | Evidence | Expected Primitive | Value | Cost | Risk | Stability | Confidence | Score | Decision |
|---|---|---|---:|---:|---:|---:|---:|---:|---|

Selected candidate:
-

Why this before others:
-

Attempt budget:
-

Stop condition:
-
```
