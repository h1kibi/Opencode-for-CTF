---
name: ctf-web-graphql
description: Use for authorized Web CTF challenges involving GraphQL endpoints, introspection queries, resolver authorization, batching attacks, and alias-based abuse.
compatibility: opencode
---

# CTF Web GraphQL

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
