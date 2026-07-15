---
name: ctf-web-websocket
description: Use when Web CTF evidence includes WebSocket, ws://, wss://, Socket.IO, SSE, EventSource, rooms, channels, namespaces, realtime events, or JSON socket messages.
---

# CTF Web WebSocket/SSE

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
