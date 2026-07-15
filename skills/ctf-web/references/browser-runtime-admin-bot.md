# Browser runtime and admin-bot playbook

Use when the map shows SPA behavior, DOM sinks, CSP, report/share/contact/preview/admin bot, postMessage, service worker, or network-only API discovery.

## Runtime ledger

Maintain this ledger before payload variants:

| Item | Evidence | Why it matters |
|---|---|---|
| XHR/fetch/WebSocket/EventSource | endpoint + method if visible | Hidden API and state transitions |
| Storage keys | localStorage/sessionStorage/document.cookie writes | Token/role/client-trust clues |
| Cookie flags | HttpOnly/Secure/SameSite/Path/Domain | Cookie theft vs action-forgery choice |
| CSP/security headers | exact policy/header | Exfil/control-plane constraints |
| DOM source/sink | source -> sink candidate | DOM XSS/HTML injection evidence |
| postMessage | listener/sender/origin check | Cross-origin message bugs |
| Service worker/cache | registered script/scope | Cache poisoning/offline route clues |
| Admin bot behavior | URL/content/file input + auth context | Payload budget and exfil strategy |

## Admin-bot profile questions

Answer these before exploit payloads:

1. Does the bot accept a URL, stored content, markdown, HTML, uploaded file, or preview object?
2. Does the bot carry an authenticated cookie, localStorage token, or privileged intranet access?
3. Does the validator allowlist `http:` and `https:` explicitly, or only call URL parsing?
4. Does the target CSP apply to the attacker's page, the victim page, or only one navigation context?
5. Is external exfil blocked? If yes, prefer same-origin upload/export/profile fields/log views over blind callbacks.
6. Is there proof-of-work, rate limit, queue delay, or one-shot bot state?

## Probe discipline

- First canary: harmless navigation/render proof, not flag exfiltration.
- Change one variable at a time: scheme, origin, path, encoding, or sink.
- After two bot triggers without new evidence, stop and rerank.
- Keep final solve reproducible with HTTP where possible; browser-only final chains must record exact state and interaction.
