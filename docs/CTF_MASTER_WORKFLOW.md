# CTF Master Workflow

## Purpose

`ctf-master` is the sole primary CTF control agent.

It does not try to be the best single exploit executor. It acts as the challenge commander:

- launch fast intake
- consolidate known facts
- retrieve local knowledge
- build a weighted top-3 plan
- orchestrate parallel validation
- reflect after failed rounds
- stop immediately on likely real flag
- terminate cleanly after 3 failed rounds

## Main Roles

### daily
Normal work only.

### researcher
KB maintenance only.

### ctf-master
Primary CTF controller.

### ctf-fast
10-minute intuition-first execution subagent.

### specialist subagents
`ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, `ctf-forensics`, `ctf-misc`

## Controller States

- `FAST_INTAKE`
- `STRATEGY`
- `PARALLEL_VALIDATE`
- `REFLECTION`
- `FINALIZE`
- `TERMINATE`

## State Flow

### 1. FAST_INTAKE

Use `ctf-fast` first unless the user explicitly wants to skip it.

Goals:
- get first known facts quickly
- test cheap low-risk paths
- avoid deep solve loops
- produce a compact handoff package

### 2. STRATEGY

After fast intake, `ctf-master` must:
- consolidate known facts
- query local KB first
- build exactly top 3 hypotheses
- rank them by plausibility, KB support, time cost, and destructiveness

### 3. PARALLEL_VALIDATE

Use team mode and/or task fanout to validate up to 3 hypotheses in parallel.

Each branch must have:
- owner
- confirm probe
- falsify condition
- expected oracle
- budget

### 4. REFLECTION

If all current hypotheses fail or block:
- review returned evidence
- identify missing facts
- run targeted recon helpers
- revise, suspend, or abandon old hypotheses
- enter the next strategy round

### 5. FINALIZE

If any branch returns a likely real flag:
- stop other branches when practical
- do at most one cheap confirmation
- report the flag and shortest reproduction path

### 6. TERMINATE

After 3 failed validation rounds:
- stop the solve
- preserve known facts and strongest evidence
- record what was falsified and what still looks plausible

## Memory Contract

Primary round memory file:

`work/ctf-evidence/<challenge-slug>/master_memory.txt`

This is the main human-readable memory source.

Use structured JSON state files only as compatibility support, not as the sole memory layer.

## Hypothesis Policy

Top-3 only.

A hypothesis may be abandoned only when:
- there is strong contradictory evidence
- or a documented blocker makes it non-competitive

Do not abandon a branch just because it failed once.

## Stop Rules

- any likely real flag -> finalize immediately
- all 3 branches fail in a round -> reflection
- 3 rounds exhausted -> terminate

## Design Principle

The master should think like a contest lead:
- use fast execution first
- use specialist execution when justified
- preserve memory
- rank only the best few plans
- stop weak branches with evidence
- do not over-narrate
