---
name: ctf-web-nosql
description: Use for authorized Web CTF challenges involving MongoDB, Elasticsearch, or other NoSQL databases with JSON/operator-based query injection.
compatibility: opencode
---

# CTF Web NoSQL Injection

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
