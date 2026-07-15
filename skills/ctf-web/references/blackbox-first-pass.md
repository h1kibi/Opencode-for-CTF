# Black-box first pass v8

Use this reference only for URL-only Web CTF targets or when source is unavailable.

## Goal

Build an application model before exploit probes:

1. Passive HTTP map: headers, cookies, routes, forms, scripts, robots, sitemap, well-known files, source-map hints, API docs, debug/source leak hints.
2. Browser/runtime map when needed: SPA routes, XHR/fetch/WebSocket/EventSource endpoints, storage keys, CSP/security headers, DOM sinks, postMessage, service workers.
3. State model: login/register/reset, roles, object IDs, workflow transitions, admin/report/share/upload/export surfaces.
4. Ranked hypothesis queue: at most top 3 active hypotheses, each with one safe next test and a kill/pivot rule.

## Default sequence

```text
ctf-web-blackbox-map mode=light
  -> if SPA/bot/DOM/API uncertainty: ctf-web-runtime-map
  -> if endpoint is promising: ctf-web-diff-probe
  -> if two accounts/object IDs exist: ctf-web-authz-matrix
  -> ctf-decision-state observe/rank/gate
```

## Do not do first

- Do not start sqlmap, wordlist fuzzing, repeated bot triggers, upload loops, large crawlers, or payload storms before a route/state/oracle map exists.
- Do not treat the first reflected parameter as the primary path unless it yields a stable differential or direct primitive.
- Do not use personal browser history/bookmarks.

## High-value black-box signals

| Signal | First safe action | Follow-up |
|---|---|---|
| Source map / `.git` / debug route | Fetch disclosure artifact | Pivot to source-audit bridge |
| JS-heavy SPA | Runtime map | Promote XHR routes to decision-state |
| Login/register/session/JWT | Auth/session differential | Authz matrix or token analysis |
| Report/share/admin bot | Bot profile + harmless canary | Browser/admin-bot reference |
| Upload/import/export/preview | One canary | File/write/render matrix |
| GraphQL/API docs | Schema/error route expansion | Diff probe selected endpoint |
| Proxy/cache/CDN headers | Cache-key/header diff | Parser differential reference |
| URL/callback/webhook field | URL parser differential | SSRF/open redirect/control-plane model |

## Required output before focused exploitation

```text
Route/Form/API/Auth map:
- route:
- method:
- inputs:
- auth state:
- visible oracle:
- likely trust boundary:
- next one-variable test:
- kill/pivot rule:
```
