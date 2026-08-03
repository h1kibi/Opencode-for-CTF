# Audit Rules Reference Index

Use this file as the top-level trigger map for `knowledge/audit-rules/`. Rules are organized by vulnerability class and language.

## Command Injection

- Detects user-controlled input reaching shell/exec functions
  - `command-injection.yaml`

## SQL Injection

- Detects unsanitized input in database queries
  - `sqli.yaml`

## SSTI (Server-Side Template Injection)

- Detects user input reaching template rendering engines
  - `ssti.yaml`

## SSRF (Server-Side Request Forgery)

- Detects user-controlled URLs in HTTP request functions
  - `ssrf.yaml`

## Deserialization

- Detects unsafe deserialization of user-controlled data
  - `deser.yaml`

## Path Traversal

- Detects user-controlled file paths in file read/write operations
  - `path-traversal.yaml`

## Weak Cryptography

- Detects weak or hardcoded cryptographic primitives
  - `weak-crypto.yaml`

## Insecure Direct Object Reference (IDOR)

- Detects predictable or user-controlled object references
  - `idor.yaml`

## XML External Entity (XXE)

- Detects insecure XML parsing configurations
  - `xxe.yaml`

## Trigger Rules

- If the challenge provides source code, run `ctf-artifact-analyze build` first, then query with the relevant ruleset.
- If multiple vulnerability classes may apply, run multiple queries or use `ruleset=all`.
- Findings from artifact analysis should inform exploit strategy, not replace manual verification.

## Maintenance Rule

When adding a new audit rule, update this index with:
- vulnerability class
- affected languages
- whether it is source-analysis, binary-analysis, or both
