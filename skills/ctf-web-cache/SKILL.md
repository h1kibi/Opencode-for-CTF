---
name: ctf-web-cache
description: Use for authorized Web CTF challenges involving web cache poisoning, cache deception, Host header injection, request smuggling, CRLF injection, or proxy/CDN misconfiguration.
compatibility: opencode
---

# CTF Web Cache

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

Load after `ctf-web` focused-probe selects a matching cache signal; do not use it for generic Web recon.

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
