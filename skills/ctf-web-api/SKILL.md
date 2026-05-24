---
name: ctf-web-api
description: Use for authorized Web CTF challenges involving REST APIs, OpenAPI/Swagger docs, JSON endpoints, BOLA/IDOR, mass assignment, and API versioning issues.
compatibility: opencode
---

# CTF Web API

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
