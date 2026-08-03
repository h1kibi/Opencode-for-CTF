---
name: ctf-web-graphql
description: Use for authorized Web CTF challenges involving GraphQL endpoints, introspection queries, resolver authorization, batching attacks, and alias-based abuse.
compatibility: opencode
---

# CTF Web GraphQL

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

Load after `ctf-web` focused-probe selects a matching graphql signal; do not use it for generic Web recon.

## Purpose

Use when challenge exposes a GraphQL endpoint or the agent detects GraphQL behavior (introspection, query/mutation patterns).

## Attack Surface

- Introspection: can the schema be queried?
- Resolver authorization: are fields protected per-role?
- Batching/alias abuse: can multiple operations bypass rate limits?
- Query depth and complexity limits
- Error messages leaking data

## Rules

- Run introspection query first if available.
- Map all queries, mutations, and field-level permissions.
- Test field-level authorization with different roles/sessions.
- GraphQL batching can bypass per-request authorization checks.
- If introspection is disabled, use common field names to probe.

## Output Contract

```markdown
# GraphQL Map

| Type | Field | Args | Auth | Sensitive | Candidate |
|---|---|---|---|---|---|
```
