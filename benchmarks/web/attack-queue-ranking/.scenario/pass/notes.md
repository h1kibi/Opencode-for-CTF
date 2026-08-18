# Recon Map

- Route: GET /search
- Input: q
- Source status: unavailable; blackbox-first

## Attack Queue

| Candidate | Value | Cost | Risk | Stability | Confidence | Score | Decision |
|-----------|-------|------|------|-----------|------------|-------|----------|
| reflected input check | 9 | 2 | 1 | 9 | 8 | 8.6 | selected |
| auth boundary check | 7 | 3 | 2 | 7 | 5 | 6.4 | queued |

Selected candidate: reflected input check because it has the highest value/stability with lower cost and risk.
Attempt budget: 1 focused probe. Stop condition: stop after one stable response and rerank the queue.
