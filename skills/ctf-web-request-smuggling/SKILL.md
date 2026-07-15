---
name: ctf-web-request-smuggling
description: Use when Web CTF evidence mentions request smuggling, TE.CL, CL.TE, duplicate Content-Length, Transfer-Encoding, chunked parsing, hop-by-hop headers, request splitting, desync, CRLF header/body boundary, proxy/cache frontend, or backend-only route reachability.
---

# CTF Web Request Smuggling/Splitting

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
