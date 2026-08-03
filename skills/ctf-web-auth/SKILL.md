---
name: ctf-web-auth
description: Use for authorized Web CTF challenges involving login, registration, password reset, MFA/OTP, account enumeration, default credentials, or authentication bypass.
compatibility: opencode
---

# CTF Web Auth

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

Load after `ctf-web` focused-probe selects a matching auth signal; do not use it for generic Web recon.

## Purpose

Use when challenge involves authentication flows: login, register, password reset, MFA, OTP, account recovery, or credential-based access.

## Attack Surface

- Login endpoint and error messages (username enumeration)
- Registration endpoint and default role assignment
- Password reset token generation and validation
- MFA/OTP flow and bypass opportunities
- Default credentials
- Brute force protection and rate limits

## Rules

- Read source for auth logic before probing.
- Use one harmless login attempt to observe error differences.
- Do not brute force unless explicitly allowed by challenge design.
- Admin session or privileged login = critical primitive, lock immediately.

## Output Contract

```markdown
# Auth Map

| Endpoint | Method | Inputs | Error Behavior | Auth Bypass Candidate |
|---|---|---|---|---|
```
