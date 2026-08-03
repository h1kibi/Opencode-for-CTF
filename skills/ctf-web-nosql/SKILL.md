---
name: ctf-web-nosql
description: Use for authorized Web CTF challenges involving MongoDB, Elasticsearch, or other NoSQL databases with JSON/operator-based query injection.
compatibility: opencode
---

# CTF Web NoSQL Injection

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching nosql signal; do not use it for generic Web recon.

## Purpose

Use when challenge uses MongoDB, Elasticsearch, or similar NoSQL databases and user input is embedded in query operators.

## Signals

- JSON body with `$gt`, `$ne`, `$regex`, `$where` operators
- MongoDB/Mongoose/Elasticsearch in source
- Login bypass via JSON operator injection
- Blind NoSQL injection via timing or regex

## Rules

- Test JSON operator injection before blind approaches.
- `$ne` and `$regex` are the most common NoSQL injection vectors.
- If source is available, trace input to query builder.
- NoSQL injection that gives data read/write = high primitive, lock immediately.
- Do not run broad extraction without confirming the injection first.

## Output Contract

```markdown
# NoSQL Map

| Endpoint | DB Type | Injection Point | Operator | Confirmed |
|---|---|---|---|---|
```
