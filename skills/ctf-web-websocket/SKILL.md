---
name: ctf-web-websocket
description: Use when Web CTF evidence includes WebSocket, ws://, wss://, Socket.IO, SSE, EventSource, rooms, channels, namespaces, realtime events, or JSON socket messages.
compatibility: opencode
---

# CTF Web WebSocket/SSE

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

Load after `ctf-web` focused-probe selects a matching websocket signal; do not use it for generic Web recon.

Treat realtime channels as API routes with auth, state, and object IDs.

First safe checks:

- Extract endpoints and event names from JS bundles and runtime network calls.
- Connect with current cookie/token; compare anonymous vs user behavior when possible.
- Record message schema: event/action name, room/channel ID, object ID, role fields, and server responses.
- Test horizontal authz on room/channel/object IDs before payload injection.
- Test harmless mass-assignment fields only when state damage is low.
- For SSE/EventSource, inspect event names and hidden data endpoints; check whether auth is enforced consistently.

Pattern recall queries:

- `WebSocket Socket.IO room channel IDOR auth bypass`
- `WebSocket mass assignment isAdmin role JSON event`
- `SSE EventSource hidden event info leak CTF`

References in local mirror:

- `ctf-web/server-side-exec.md`
- `ctf-web/field-notes.md`
