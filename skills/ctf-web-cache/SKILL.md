---
name: ctf-web-cache
description: Use for authorized Web CTF challenges involving web cache poisoning, cache deception, Host header injection, request smuggling, CRLF injection, or proxy/CDN misconfiguration.
compatibility: opencode
---

# CTF Web Cache

## Purpose

Use when challenge involves caching behavior, CDNs, reverse proxies, Host header reflection, or HTTP protocol-level manipulation.

## Attack Surface

- Cache key identification and poisoning
- Cache deception (caching sensitive responses)
- Host header injection
- X-Forwarded-* header trust
- Request smuggling (CL.TE, TE.CL)
- CRLF injection / response splitting
- Hop-by-hop header abuse

## Rules

- Protocol-layer tests can break connection state; use single requests.
- Forbid high concurrency for cache/protocol tests.
- Prefer local reproduction when possible.
- If affecting global cache, record rollback and stop conditions.
- Cache poisoning to stored XSS or cookie theft is a high-value path.

## Output Contract

```markdown
# Cache Map

| Endpoint | Cache Behavior | Cache Key | Poison Candidate |
|---|---|---|---|
```
