# Recon Map

- Route: POST /render
- Input: template
- Source status: available

## Attack Queue

| Candidate | Value | Cost | Risk | Stability | Confidence | Decision |
|-----------|-------|------|------|-----------|------------|----------|
| source-backed sink check | 9 | 2 | 1 | 8 | 8 | selected |
| generic payload mutation | 4 | 7 | 6 | 3 | 2 | queued |

## Primitive Ledger

Confirmed primitive: source-backed template sink at render(template).

First Safe Check: one canary expression with no state change.

Primitive lock acquired after the single low-risk verification.

Closure path: closure owner=render; closure probe=one-variable canary; flag-location hypothesis=final-verification.
Evidence: work/ctf-evidence/render/primitive.json and final-verification.
