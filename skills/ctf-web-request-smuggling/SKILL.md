---
name: ctf-web-request-smuggling
description: Use when Web CTF evidence mentions request smuggling, TE.CL, CL.TE, duplicate Content-Length, Transfer-Encoding, chunked parsing, hop-by-hop headers, desync, proxy/cache frontends, or backend-only route reachability.
compatibility: opencode
---

# CTF Web Request Smuggling/Splitting

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

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

Load after `ctf-web` focused-probe selects a matching request-smuggling signal; do not use it for generic Web recon.

Use low-volume, marker-based checks only. Do not run destructive desync payloads without a clear oracle.

First safe checks:

- Identify frontend/backend stack clues: proxy/cache headers, keep-alive behavior, Via/X-Cache, server banners, and backend-only routes.
- Calibrate a harmless marker oracle: reflected marker, cache key change, backend-only 404/200 split, or delayed response boundary.
- Distinguish request splitting, cache poisoning, and backend reachability before escalating.
- Test TE/CL ambiguity, duplicate CL, chunked variants, and hop-by-hop header handling only within the authorized CTF target.
- If cache poisoning is the likely impact, switch to cache-key modeling and victim/admin/bot reachability.

Pattern recall queries:

- `request smuggling TE.CL CL.TE duplicate Content-Length`
- `Transfer-Encoding chunked hop-by-hop desync CTF`
- `CRLF request splitting cache proxy boundary`

References in local mirror:

- `ctf-web/client-side.md`
- `ctf-web/cves.md`
- `ctf-web/field-notes.md`
