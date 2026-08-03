---
name: ctf-web-sqli
description: Use for authorized Web CTF SQL injection challenges involving query construction, database errors, injectable parameters, blind/time-based behavior, GraphQL-backed SQL, auth bypass, or database extraction.
compatibility: opencode
---

# CTF Web SQLi

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching sqli signal; do not use it for generic Web recon.

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

## DBMS Checklist

Use evidence before DB-specific probes:

- SQLite: local `.db`, `sqlite3`, file-backed DB, Flask/Django default dev artifacts.
- MySQL/MariaDB: `mysql`, `mysqli`, `pymysql`, `mysql2`, port 3306, backtick identifiers.
- PostgreSQL: `psycopg`, `pg`, port 5432, dollar quoting, `RETURNING`, `::type` casts.
- MSSQL: `pyodbc`, `tedious`, port 1433, bracket identifiers, stacked query behavior.
- ORM/raw SQL: check string concatenation, raw query APIs, order/filter params, search boxes, and GraphQL resolvers.
- Blind conditions: compare response length, status, timing, redirect target, row count, and auth state.

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
