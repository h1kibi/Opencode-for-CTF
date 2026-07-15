# V9 black-box Web toolchain

Use this toolchain for URL-only or source-poor Web targets. The goal is application modeling before exploitation.

V9 absorbs useful ideas from httpx, katana/hakrawler, gau/waybackurls/ParamSpider, ffuf/gobuster, Dalfox, and Jaeles/Nuclei, but keeps them as low-noise CTF decision inputs instead of bulk scanners.

## Default sequence

1. `ctf-web-fingerprint` first for app style, framework/API/auth/infra hints, high-value surfaces, and next-tool routing.
2. `ctf-web-blackbox-map mode=light` for headers, cookies, route/form/API/admin/debug/upload/source-leak signals, static JS hints, state model, and `attack_queue_seed`.
3. `ctf-web-js-surface-map` when JS bundles, SPA, XHR/fetch-only APIs, source maps, GraphQL operation names, client-side role strings, storage keys, or hidden routes matter.
4. Escalate to `ctf-web-blackbox-map mode=browser` or `ctf-web-runtime-map` when DOM, postMessage, service worker, admin bot, CSP, browser storage, or browser-only network behavior matters.
5. Use `ctf-web-url-corpus` to normalize URLs from crawl, JS extraction, logs, archived URL tools, or notes into route patterns, parameter families, and high-value URL candidates before fuzzing.
6. Use `ctf-web-template-check` only after a signal appears. It maps signals to one focused safe check; it is not a scanner.
7. Use `ctf-web-reflection-map` before XSS, open redirect, header-sink, JSON break-out, or DOM payload variants. It must identify the reflected parameter and context first.
8. Use `ctf-web-state-machine-map` for login/register/reset/admin/object/workflow/payment/report/upload state. Pair with `ctf-web-authz-matrix` when two accounts, object IDs, roles, tenants, reset tokens, or workflow steps exist.
9. Use `ctf-web-fuzz-plan` before ffuf/gobuster/wordlist fuzzing. The plan must define dimension, baseline, filters, budget, ranking rules, stop conditions, and decision-state contract.
10. Use `ctf-web-diff-probe` for a single chosen endpoint and one variable only: method, content type, duplicate parameter, query/body key, header, cookie, encoding, path normalization, auth state, or cache key. Feed the result to `ctf-decision-state observe`.
11. If source map, `.git`, backup, JAR/class, PHP source, Docker/config, stack trace, OpenAPI, or debug artifact appears, pivot to `source-leak-audit-bridge.md` and source-guided route/sink mapping.

## Triggered references

Read these references only when their trigger appears:

- `blackbox-first-pass.md`: URL-only first pass and anti-payload-storm rules.
- `browser-runtime-admin-bot.md`: SPA/browser/admin-bot/CSP/postMessage/service-worker flow.
- `parser-differential.md`: method/content-type/header/cookie/path/cache/parser mismatch probes.
- `authz-state-machine.md`: IDOR, two-account matrix, workflow replay/skip, CSRF boundary.
- `source-leak-audit-bridge.md`: black-box leak to PHP/Java/source audit bridge with evidence contract.
- `ctf-web-pattern-index.md`: pattern families and pattern gate.

## Hard rules

A black-box probe is progress only if it updates at least one of:

- target profile
- route/state/oracle model
- URL/parameter corpus
- browser/runtime model
- response differential
- hypothesis confirmation/falsification
- final control plane

Payload strings or wordlist volume without new differential are not progress.

When `ctf-web-blackbox-map`, `ctf-web-template-check`, `ctf-web-reflection-map`, `ctf-web-state-machine-map`, or a pattern card outputs a first safe check, the next action must be exactly one such check or a `ctf-decision-state probe` contract.
