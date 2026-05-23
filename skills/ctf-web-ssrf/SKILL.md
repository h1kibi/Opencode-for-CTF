---
name: ctf-web-ssrf
description: Use for authorized Web CTF SSRF challenges involving server-side URL fetches, webhooks, image importers, metadata access, internal services, redirects, DNS tricks, or URL parser differentials.
compatibility: opencode
---

# CTF Web SSRF

## Purpose

Use this skill when an application fetches URLs or network resources on behalf of the user. The workflow is vulnerability-specific: identify fetch sink, prove server-side fetch, map allowed schemes/hosts, bypass filters, and retrieve the intended internal resource.

## Scope

Use only on authorized CTF/lab/local targets. Do not probe unrelated internal or external networks.

## Inputs

Collect:

- URL-taking parameters, upload importers, webhook fields, PDF/image fetchers, XML parsers, and source fetch calls.
- Baseline allowed and blocked URLs.
- Network topology hints: Docker service names, localhost ports, challenge hostnames, metadata URLs, admin services.

## Workflow

1. Identify the server-side fetch sink from source or behavior.
2. Prove fetch behavior with a safe localhost/challenge-controlled target when available.
3. Determine allowed schemes, redirects, DNS behavior, IP literal handling, and parser normalization.
4. Map only challenge-relevant internal targets: localhost, Docker service names, documented ports, or challenge-provided hostnames.
5. Test bypasses minimally: redirects, alternate IP notation, IPv6 localhost, URL credentials, trailing dots, scheme confusion, or DNS rebinding only if in scope.
6. Retrieve the intended flag/admin/internal resource.
7. Write a solver that reproduces the minimal request chain.

## URL Parser Checklist

Check validation/fetch parser differences only when a filter exists:

- Scheme normalization and scheme allowlists.
- Hostname case folding and trailing dots.
- Embedded credentials such as `user@host`.
- Percent encoding and double encoding.
- IPv4 decimal, octal, hex, and mixed notation.
- IPv6 localhost and IPv4-mapped IPv6.
- Redirect handling and redirect method preservation.
- DNS resolution timing and rebinding only in explicit lab scope.
- Path, query, and fragment handling differences.
- Parser differences between frontend validation and backend fetch library.

## Tool Discipline

- Avoid broad port scans through SSRF.
- Prefer source-derived internal hostnames over guessing.
- Record each target tested and why it is in scope.
- Use `curl` or Python requests for reproducible requests.
- Do not depend on public callback infrastructure unless explicitly allowed.

## Evidence Requirements

A confirmed SSRF needs:

- Fetch sink and request.
- Proof that the server, not the browser, made the request.
- Filter/bypass evidence if applicable.
- Internal resource retrieval or source proof of impact.

## Output Contract

`solve.py` should reproduce the SSRF request chain and print the flag or target response. `notes.md` should include sink, allowed URL forms, bypasses tried, internal target evidence, and final request.

## Stop Conditions

Stop or ask when the only next step is broad internal scanning, public callback use is needed but not authorized, or tested targets are not clearly challenge-related.
