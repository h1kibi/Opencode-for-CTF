---
description: Convert a completed or failed Web CTF solve into lessons and skill patch proposals
agent: ctf-retro
---

Use `ctf-common` and `ctf-web-retro`.

Review:
$ARGUMENTS

Inputs to inspect when present:

- `notes.md`
- `failure_report.md`
- `solve.py`
- `solve.js`
- `agent_flag.txt`
- terminal/output excerpts
- user-provided reflection

Workflow:

1. Determine whether the challenge was solved.
2. Reconstruct the phase timeline:
   - recon
   - attack-queue
   - focused-probe
   - primitive-lock
   - control-plane
   - final-chain
3. Identify delays:
   - missed recon signal
   - wrong attack queue ranking
   - excessive focused-probe budget
   - late primitive lock
   - unstable control plane
   - unsafe or damaging action
4. Produce:
   - `retros/<challenge-or-date>.md`
   - `lessons/web-<pattern>.md`
   - `patches/<target-skill>-<short-label>.md`
5. Do not directly modify core skills.

Output format:

```markdown
# Web Retro

## Solved / Not Solved

## Final Chain

## Phase Timeline

| Phase | What Happened | Better Move |
|---|---|---|

## Missed Signals

## Wrong Prioritization

## Stability Problems

## Skill Patch Proposals

| Target Skill | Proposed Rule | Reason | Risk of Overfitting |
|---|---|---|---|
```
