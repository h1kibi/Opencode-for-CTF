---
name: ctf-web-retro
description: Use after a challenge is solved or timed out. Identifies slow points, generates lessons learned, and proposes skill patches without directly modifying core skills.
compatibility: opencode
---

# CTF Web Retro

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
