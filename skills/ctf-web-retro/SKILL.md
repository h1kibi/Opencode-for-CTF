---
name: ctf-web-retro
description: Use after a challenge is solved or timed out. Identifies slow points, generates lessons learned, and proposes skill patches without directly modifying core skills.
compatibility: opencode
---

# CTF Web Retro

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return a compact lesson and proposed rule change to `ctf-common` / the owning skill; do not patch another skill silently.

## First Safe Action

Read the final evidence packet and failed-path ledger before proposing any lesson or skill change.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after a Web challenge is solved, abandoned, or timeboxed for lesson extraction.

## Purpose

After solving or timing out on a Web CTF challenge, analyze what worked, what failed, where the agent was slow or stuck, and generate actionable lessons. This skill closes the feedback loop to improve future solves.

## Retro Analysis

Review the following from `notes.md`:

- Recon Map: was anything missed that later turned out to be critical?
- Attack Queue: was the right candidate selected? Was scoring accurate?
- Primitive Ledger: were primitives correctly classified and locked?
- Control Plane: was the best channel chosen? Was it stable?
- Stability Guard: were any avoidable crashes or state damage caused?
- Exploit Chain: was the chain the shortest possible path?
- Time spent: where did the agent spend disproportionate time?

## Failure Pattern Identification

Identify patterns that led to failure or delay:

- Skipped, shallow, or incomplete recon.
- Chose a low-value or high-cost candidate first.
- Exhausted attempt budget on a dead-end path.
- Did not lock a primitive when one was confirmable.
- Selected an unstable or blind control plane.
- Damaged the instance with mass fuzzing, repeated bot triggers, or file overwrites.
- Wrote an unreliable solve script.
- Failed to recognize the framework or language.

## Skill Patch Proposal

For each identified failure pattern, produce a minimal, actionable suggestion phrased as a skill patch. Format:

```markdown
## Patch Proposal: [short label]

### Pattern
[what the agent did wrong]

### Evidence
[from notes.md or observations]

### Proposed Rule Addition
[suggested rule to add to a skill]

### Target Skill
[which skill file should get this rule]
```

Do not directly modify core skill files. Proposals are suggestions for the operator.

## Lessons Learned

## Pattern Library Update

When a solve or failure reveals a reusable Web CTF technique, propose a pattern entry under one of the existing `skills/ctf-web-patterns/references/` files:

- `auth-patterns.md`
- `client-side-patterns.md`
- `cve-shaped-patterns.md`
- `language-patterns.md`
- `parser-proxy-patterns.md`
- `server-side-patterns.md`

Do not copy long writeups. Write a compact pattern entry:

```markdown
## Pattern: <short name>

Signals:
- 

Expected primitive:
- 

First safe check:
- 

Attack queue effect:
- Value:
- Cost:
- Risk:
- Stability:
- Confidence:

Stop rule:
- 

Escalation:
- 

Source:
- local retro / imported public reference / challenge note
```

A pattern is acceptable only if it changes future decision-making:

* better route
* better first safe check
* better stop rule
* better primitive lock
* better control-plane choice

Write one lesson per insight:

```markdown
## Lesson: [one-line summary]

- Category: recon / attack-queue / primitive-lock / control-plane / stability / exploit-chain
- What: [what went wrong or right]
- Impact: [how it affected solve time or success]
- Fix: [what should change next time]
```

## Output Contract

Write this to `notes.md` or create `retro.md`:

```markdown
# Retro

## Solved / Not Solved
-

## What Worked
-

## What Failed

| Attempt | Reason | Evidence |
|---|---|---|

## Missed Signals
-

## Skill Gaps
-

## Time Analysis
- Total time:
- Recon phase:
- Attack queue:
- Focused probes:
- Primitive lock:
- Control plane:
- Exploit chain:

## Lessons
-
```

## Integration

This skill integrates with `ctf-common`'s failure report format. Use its Failure Report section when the challenge was not solved.
