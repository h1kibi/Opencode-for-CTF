---
name: ctf-web-sqli
description: Use for authorized Web CTF SQL injection challenges involving query construction, database errors, injectable parameters, blind/time-based behavior, GraphQL-backed SQL, auth bypass, or database extraction.
compatibility: opencode
---

# CTF Web SQLi

## Purpose

Use this skill when Web evidence suggests SQL injection. The workflow is adapted from AWE's SQLi pipeline: parameter discovery, database fingerprinting, context analysis, systematic probes, multi-signal verification, and reportable exploitation.

## Scope

Use only on authorized CTF/lab/local targets. Do not run high-volume automated scanners or destructive SQL unless the challenge explicitly permits it.

## Inputs

Collect:

- Endpoint, method, parameters, cookies, headers, JSON body, GraphQL operation, and baseline response.
- Source SQL construction sites if source exists.
- Error messages, response-length changes, timing differences, auth boundary behavior, and DB-specific strings.

## Workflow

1. Identify candidate injection points from routes, forms, links, APIs, source, and GraphQL schemas if available.
2. Classify parameter location: query, path, form, JSON, cookie, header, GraphQL, or nested object.
3. Establish baseline responses for normal and invalid values.
4. Use minimal probes first: quote imbalance, boolean differential, numeric arithmetic, type confusion, or harmless time test.
5. Fingerprint likely database only after a candidate signal exists.
6. Confirm with at least two signals where possible: error, boolean difference, timing, row count, auth bypass, or source-code proof.
7. Determine extraction goal: bypass, table/column discovery, single secret extraction, or flag row retrieval.
8. Build `solve.py` using reproducible HTTP requests.

## Tool Discipline

- Prefer manual, minimal probes before sqlmap-style automation.
- Avoid testing CSRF/token parameters unless source or behavior shows they reach SQL.
- Keep payload count small and targeted.
- Record request, payload class, response signal, and false-positive checks in `notes.md`.
- Use database clients only for local DBs or explicit credentials.

## Evidence Requirements

A confirmed SQLi needs:

- Injection point and request.
- Baseline and probe response comparison.
- DB/source evidence or a second independent signal.
- A minimal extraction or bypass demonstrating impact.

## Output Contract

`solve.py` should accept or define target URL, reproduce the injection, and print the flag or exploit result. `notes.md` should include injection point, DB guess, payload evolution, and verification evidence.

## Stop Conditions

Stop or ask when signals are inconsistent, probing risks out-of-scope data, the target is not authorized, or extraction would require broad dumping unrelated to the challenge goal.
