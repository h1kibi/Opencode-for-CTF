# closure-jwt-role-forge

## Trigger
- A token can be forged, re-signed, key-confused, role-mutated, or otherwise turned into stronger authenticated state.

## Why it looks promising
- The token is already an auth/role primitive; the main problem becomes closure through privileged surfaces.

## What usually goes wrong
- The solver keeps studying token internals after forgeability is already proven.

## Better question
- Which privileged route, role-only object, or internal API becomes reachable once this forged token is used?

## First corrective probe
- Move immediately from token semantics to privileged route/object enumeration with a tiny high-value set.

## Closure queue
1. admin-only page/object/API
2. debug/export/config routes under forged role
3. object ID expansion under stronger authz
4. internal workflow transitions now allowed
5. one clean forged-token replay skeleton

## Stop rule
- After forgeability is confirmed, token theory is lower priority than privileged route closure.
