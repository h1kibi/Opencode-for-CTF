---
name: ctf-web-api
description: Use for authorized Web CTF challenges involving REST APIs, OpenAPI/Swagger docs, JSON endpoints, BOLA/IDOR, mass assignment, and API versioning issues.
compatibility: opencode
---

# CTF Web API

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

Load after `ctf-web` focused-probe selects a matching api signal; do not use it for generic Web recon.

## Purpose

Use when challenge exposes REST API endpoints, OpenAPI/Swagger documentation, or JSON-based communication.

## Attack Surface

- API documentation: Swagger, OpenAPI, /api/docs, /api/schema
- Endpoint enumeration: GET/POST/PUT/PATCH/DELETE mapping
- Object-level authorization: BOLA/IDOR via resource IDs
- Function-level authorization: admin endpoints accessible to users
- Mass assignment: extra JSON properties accepted
- API versioning: v1/v2/beta/internal endpoints with different auth

## Rules

- Map all API endpoints with methods and required auth first.
- If OpenAPI docs exposed, read them before probing.
- Test IDOR with two different user sessions/identities.
- Test mass assignment by adding role/is_admin/owner_id fields.

## Output Contract

```markdown
# API Matrix

| Method | Path | Auth | Role | Object ID | State Change | Candidate |
|---|---|---|---|---|---|---|
```
