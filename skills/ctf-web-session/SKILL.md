---
name: ctf-web-session
description: Use for authorized Web CTF challenges involving session cookies, session fixation, CSRF tokens, signed cookies with weak secrets, and session management flaws.
compatibility: opencode
---

# CTF Web Session

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
