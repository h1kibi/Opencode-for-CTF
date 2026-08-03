---
name: ctf-web-session
description: Use for authorized Web CTF challenges involving session cookies, session fixation, CSRF tokens, signed cookies with weak secrets, and session management flaws.
compatibility: opencode
---

# CTF Web Session

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

Load after `ctf-web` focused-probe selects a matching session signal; do not use it for generic Web recon.

## Purpose

Use when challenge involves session cookies, CSRF tokens, signed/encrypted client-side tokens, session fixation, or session management logic.

## Attack Surface

- Cookie name, flags (HttpOnly, Secure, SameSite)
- Cookie content format: JWT, Flask session, Django session, custom signed, plain
- Session fixation opportunities
- CSRF token generation and validation
- Weak signing secrets or key reuse

## Rules

- Decode and inspect cookie format first.
- Check for known weak keys (Flask secret key, Django SECRET_KEY in source).
- Session fixation: can you set a known session then use it after login?
- If cookie is forgeable, that is a critical primitive.

## Output Contract

```markdown
# Session Map

| Cookie | Format | Flags | Forgeable | Attack |
|---|---|---|---|---|
```
