---
name: ctf-web-auth
description: Use for authorized Web CTF challenges involving login, registration, password reset, MFA/OTP, account enumeration, default credentials, or authentication bypass.
compatibility: opencode
---

# CTF Web Auth

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
