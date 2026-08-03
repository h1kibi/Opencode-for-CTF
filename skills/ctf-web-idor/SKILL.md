---
name: ctf-web-idor
description: Use for authorized Web CTF IDOR and access-control challenges involving object IDs, user IDs, role checks, tenant boundaries, predictable resources, or missing ownership validation.
compatibility: opencode
---

# CTF Web IDOR

## Output Contract

Return a compact result containing confirmed facts, unresolved uncertainty, attempted discriminator, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching idor signal; do not use it for generic Web recon.

## Purpose

Use when access control may depend on user-controlled object identifiers or missing ownership checks.

## Signals

- Numeric IDs, UUIDs, filenames, slugs, invoice/order/note/profile IDs, tenant IDs, or GraphQL object IDs.
- Source checks authentication but not ownership.
- APIs returning different users' objects.

## Workflow

1. Map authenticated roles and object types.
2. Identify object identifiers in URLs, JSON, forms, cookies, headers, GraphQL variables, and hidden fields.
3. Establish baseline access for one owned object.
4. Test one adjacent or source-known object ID, not broad enumeration.
5. Compare response status, body, and side effects.
6. If source exists, locate missing owner/tenant check.
7. Retrieve only challenge-relevant object or flag.

## Access-Control Checklist

Use one minimal check per hypothesis:

- Horizontal IDOR: same role, different object owner.
- Vertical IDOR: lower role accessing higher role endpoint.
- Tenant boundary: organization, team, workspace, or project ID.
- Hidden field trust: user ID, role, price, owner, or status in client-controlled fields.
- GraphQL object ID or global ID decoding.
- UUID predictability only when source, logs, or adjacent leaks support it.
- Cache or static file exposure after object creation.
- Method confusion: GET vs POST vs PUT vs DELETE.
- Mass assignment changing owner, role, or visibility.

## Evidence Requirements

- Auth context.
- Owned baseline object.
- Changed identifier and response difference.
- Missing check or verified unauthorized object access.

## Stop Conditions

Stop when testing would enumerate real users, access non-challenge data, or no object ownership hypothesis is supported.
