---
description: CTF post: OMO-style lightweight CTF retro; capture winning signal, wasted branch, and reusable pattern feedback
agent: ctf-master
subtask: false
---

Run a lightweight CTF retro after solve, timeout, or abandoned branch.

Context:
$ARGUMENTS

Rules:
- Do not continue exploiting.
- Identify reusable lessons, not challenge-specific writeup prose.
- If a pattern card contributed, recommend `ctf-pattern-feedback` result: confirmed, falsified, led_to_flag, misleading, weak, or skipped.
- Record where time was wasted and which gate should have triggered earlier.
- Keep it short enough to paste into notes or lessons.
- If a compact evidence trail exists under `work/ctf-evidence/<challenge-slug>/`, prefer it over memory-only reconstruction.
- If the lesson should be promoted into structured retrieval, provide enough fields to update `knowledge/lessons/lessons.index.json` later.
- If readiness or QA friction slowed the solve, call it out explicitly as config debt rather than challenge difficulty.

Return compactly:
1. Challenge/category.
2. Winning primitive or best-known blocker.
3. First useful signal.
4. Wasted branch or slow point.
5. Gate/tool that should trigger next time.
6. Pattern feedback recommendation.
7. One skill/config patch idea.
8. Lesson index candidate fields: family, triggers, signals, better_question, stop_rule, query_terms.
