---
name: ctf-web-jwt
description: Use for authorized Web CTF JWT and token challenges involving weak secrets, alg confusion, none algorithm, kid/jku/x5u header abuse, claim tampering, or session token logic.
compatibility: opencode
---

# CTF Web JWT

## Purpose

Use when authentication or authorization depends on JWTs or structured bearer/session tokens.

## Signals

- Tokens with three base64url segments.
- Headers containing `alg`, `kid`, `jku`, `x5u`, `typ`, or `crit`.
- Source using JWT libraries, custom signing, cookies, or bearer auth.
- Role, username, admin, exp, or object ID claims.

## Workflow

1. Decode header and claims without trusting them.
2. Identify signing algorithm and verification code from source or behavior.
3. Test claim tampering only after confirming verification behavior.
4. Check common issues: `alg:none`, HS/RS confusion, weak HMAC secret, missing exp/aud/iss checks, `kid` path traversal, `jku/x5u` remote key trust, and custom base64/JSON parsing.
5. Prefer source-derived secret or verification flaw over brute forcing.
6. Forge the minimal token needed for the challenge goal.
7. Write `solve.py` that creates the token and performs the verifying request.

## Evidence Requirements

- Original token structure.
- Verification weakness or source evidence.
- Forged token claims.
- Response proving privilege change or flag access.

## Stop Conditions

Stop when brute force is unbounded, token belongs to an out-of-scope system, or no verification weakness is supported by evidence.
