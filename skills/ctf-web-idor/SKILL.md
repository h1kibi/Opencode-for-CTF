---
name: ctf-web-idor
description: Use for authorized Web CTF IDOR and access-control challenges involving object IDs, user IDs, role checks, tenant boundaries, predictable resources, or missing ownership validation.
compatibility: opencode
---

# CTF Web IDOR

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

## Evidence Requirements

- Auth context.
- Owned baseline object.
- Changed identifier and response difference.
- Missing check or verified unauthorized object access.

## Stop Conditions

Stop when testing would enumerate real users, access non-challenge data, or no object ownership hypothesis is supported.
