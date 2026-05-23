---
name: ctf-web
description: Use for authorized Web CTF challenges involving HTTP services, source review, routing, authentication, cookies, sessions, APIs, templates, upload handling, SSRF, SQL injection, XSS, SSTI, LFI, IDOR, JWT, deserialization, or browser interaction.
compatibility: opencode
---

# CTF Web

## Purpose

Use this skill as the Web challenge controller. It maps the attack surface, separates source review from black-box probing, and routes specific evidence to specialized web skills.

The structure is influenced by AWE's vulnerability-specific pipelines: reconnaissance, input discovery, context analysis, minimal probe, verification, fallback, and report.

## Scope

Use only for authorized CTF, lab, benchmark, or local web services. Avoid aggressive brute force and broad scanning unless the challenge explicitly requires it.

## Inputs

Collect:

- Target URL, host, port, and scope.
- Source tree, Docker files, environment assumptions, and dependency manifests.
- Framework, routes, middleware, templates, database access, file operations, outbound HTTP, auth/session logic.
- Inputs: query params, path params, form fields, JSON bodies, cookies, headers, upload fields, WebSocket messages, admin/debug endpoints.

## Workflow

1. Confirm target and record scope in `notes.md`.
2. Read source if available before probing blindly.
3. Map routes and inputs into an attack surface table.
4. Identify trust boundaries: auth, roles, object ownership, file paths, server-side fetch, template rendering, SQL, serialization, and uploads.
5. Establish baseline requests and responses.
6. Use harmless probes first, then vulnerability-specific minimal probes.
7. Route to a specialized skill when evidence is present:
   - SQL query construction or DB errors: `ctf-web-sqli`.
   - Template rendering of user input: `ctf-web-ssti`.
   - Server-side URL fetch: `ctf-web-ssrf`.
   - File path input: LFI/path traversal workflow in this skill until a dedicated skill exists.
   - Browser execution/reflection: XSS workflow in this skill until a dedicated skill exists.
   - Object ownership or numeric IDs: IDOR workflow in this skill until a dedicated skill exists.
   - JWT/session/token logic: token workflow in this skill until a dedicated skill exists.
8. Write a deterministic `solve.py` or `solve.js` with target URL as an argument or variable.

## Tool Discipline

- Use `curl` for reproducible HTTP requests.
- Use browser automation for stateful flows, JavaScript rendering, cookie/session behavior, admin bot behavior, or DOM evidence.
- Use database tools only when the challenge exposes a local DB, source config, or explicit credentials.
- Use `nmap` only for localhost or explicitly authorized challenge hosts.
- Record meaningful request/response summaries in `notes.md`, not every byte of HTML.

## Evidence Requirements

Web findings require:

- A request that triggers the behavior.
- A response or browser observation proving the behavior.
- Source-code path when source exists.
- A minimal reproduction before exploitation.
- False-positive exclusion where applicable.

## Output Contract

`notes.md` should contain:

- Route/input map.
- Bug-class hypotheses.
- Probes and responses.
- Confirmed exploit chain.
- Final solver command.

The solver must produce or retrieve the verified flag without manual browser steps when practical.

## Stop Conditions

Ask or stop when the target is outside authorized scope, requires real third-party interaction, needs credentials not provided, or repeated probes are causing no new observations.
