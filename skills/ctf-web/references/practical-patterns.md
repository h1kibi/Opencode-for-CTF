# Web CTF practical patterns and stuck recovery

Use this reference before spending time on exotic payloads or when a Web branch becomes flat. The goal is to recognize common challenge-shaped patterns and choose the shortest verification.

## Common direct-win patterns

- Source leak beats exploitation: `.git`, `.svn`, `.DS_Store`, backup zip/tar, editor swap, `.phps`, source map, exposed Dockerfile/compose, exposed package lock, or debug stack trace. If found, pivot to source-guided flag recovery.
- Auth/session shape beats brute force: unsigned JWT, weak JWT secret hinted by title, Flask/Django/Laravel/Express signed cookie shape, predictable reset token, role stored client-side, or missing server-side role check. Verify token semantics before fuzzing.
- Parser mismatch beats payload volume: URL parsing, path normalization, duplicate params, content-type confusion, JSON vs form body, case sensitivity, trailing slash, semicolon path params, encoded slash, Unicode normalization, and proxy/app disagreement. Use one-variable differentials.
- Business logic beats injection: coupon/order/points/vote/lottery/reset/report workflows often need replay, skip-step, negative quantity, race, stale token, or IDOR rather than classical injection. Model state before payloads.
- Admin bot/XSS requires target state: first identify where the secret lives and which origin/path the bot visits; reflection alone is not enough. Confirm CSP, cookie flags, storage, and bot workflow before payload variants.
- Upload/file-write requires execution or readback path: confirm storage path, extension handling, static serving, parser behavior, archive extraction behavior, and whether the uploaded content reaches a server-side interpreter or sensitive consumer.

## Competition triage heuristics

- Let title, description, attachments, Dockerfile, route names, dependency versions, and visible UI vocabulary bias the first hypotheses. Challenge authors usually leave one intended signal.
- Prefer a 30-second source/config search over a 10-minute payload loop.
- Prefer one semantic differential over many payload variants.
- Prefer one clean primitive-to-flag path over broad vulnerability collection.
- When two hypotheses have similar value, choose the one with the cheaper falsification test.
- If the app has a login/register/report/admin workflow, create two users early when allowed and use authz/state-machine checks before deep injection.
- If a challenge includes bot/report functionality, treat browser runtime evidence as first-class. If no bot/admin/secret-bearing browser exists, deprioritize XSS.
- If a challenge includes file upload/import/archive/image/pdf/svg/xml, prioritize parser and storage mismatch, metadata processing, path traversal in archives, SSRF in fetchers, XXE in XML/SVG/Office, and file-write/readback primitives.

## Stuck recovery

After two failed top hypotheses, run one orthogonal high-information check:

- source/config leak
- JS/source-map audit
- auth/session semantics
- state-machine/IDOR
- parser differential
- flag-location backward slice

If a route returns generic errors, search for logs/debug endpoints/source maps rather than only mutating payloads.

If all black-box tests are flat, try to obtain source or runtime surface: JS bundles, maps, Docker clues, dependency manifests, static assets, error pages, and API docs.

If exploitation succeeds but final read fails, stop and revisit the privilege boundary rather than trying unrelated vulnerabilities.
