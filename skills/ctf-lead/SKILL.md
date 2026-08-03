---
name: ctf-lead
description: Use as the top-level CTF conductor. It maintains challenge state, loads the smallest useful skills, preserves risk budgets, and routes work across router, explorer-style triage, category solvers, closer, and retro phases.
compatibility: opencode
---

# CTF Lead


## Load When

Load when a primary agent must coordinate phases, owner changes, resume state, or cross-category pivots.

## Do Not Load When

Do not use it for initial category scoring (`ctf-router` owns that), detailed exploit technique, or final flag verification (`ctf-closure-gate` and the category owner handle those).

## Required Inputs

Read the route plan, current evidence snapshot, active phase, candidate owner, and the category orchestrator's latest handoff.

## First Safe Action

Normalize the current phase and owner in the state files before assigning new work; preserve the previous owner and pivot reason.

## Dispatch / Handoff

Dispatch only to one active category owner at a time unless the phase explicitly permits independent recon. Return ranked work and state changes to the primary agent; escalate unresolved cross-category ambiguity to `ctf-router`.

## Purpose

Use this skill as the main conductor for authorized CTF work. It is responsible for:

- keeping the challenge in the correct phase
- maintaining `notes.md` and `.ctf-state.json`
- loading the smallest useful skill set first
- preventing premature deep exploitation
- switching from exploration to closure only when evidence warrants it

## Phase Model

Track one current phase:

- `triage`
- `recon`
- `attack-queue`
- `focused-probe`
- `primitive-lock`
- `control-plane`
- `final-chain`
- `retro`

Unknown challenges start in `triage`.

## Default Routing

1. Start with `ctf-common` and `ctf-router`.
2. If the category is still unclear, stay in triage and collect only the cheapest clarifying evidence.
3. If the category becomes clear, route to one specialized solver:
   - `ctf-web`
   - `ctf-pwn`
   - `ctf-rev`
   - `ctf-crypto`
   - `ctf-forensics`
   - `ctf-misc`
4. When a critical primitive or two high primitives are confirmed, stop broad exploration and switch to closure behavior.
5. When solved or timed out, route to `ctf-retro`.

## State Files

Maintain both:

- `notes.md` for human-readable evidence and command logs
- `.ctf-state.json` for resumable machine-readable state

Minimum `.ctf-state.json` fields:

- challenge name
- category or `unknown`
- flag format
- target
- current phase
- next action
- hypotheses
- confirmed primitives
- blocked paths
- risk budget

## Risk Rules

- default request budget: 20
- default concurrency: 1
- default upload canaries: 2
- default bot-triggering payloads: 2
- do not move to high-risk actions without a canary and a written reason

## Output Contract

At the top of `notes.md`, keep:

```markdown
# Challenge Summary

- Name:
- Category:
- Flag format:
- Target:

# Phase

- Current phase:
- Next required action:
```

## Stop Conditions

Stop and ask when:

- the target scope is unclear
- a required remote dependency is unavailable
- the next action would be destructive or broad without justification
- the current path is blocked and no stronger alternative exists yet
