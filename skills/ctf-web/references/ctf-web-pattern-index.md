# CTF Web pattern index v8

Load specific pattern details only after a signal appears. Do not use this index as permission to payload-storm.

## Pattern families

- Injection: SQL/NoSQL/SSTI/command/template/expression/XML.
- Auth/session: JWT/JWE, Flask/Django/Rails/PHP sessions, CSRF, session fixation, reset tokens, OAuth/OIDC/SAML.
- Authz/state: IDOR, mass assignment, workflow skip/replay, multi-tenant boundary, role confusion.
- Parser mismatch: proxy vs app path, duplicate params, content-type switch, encoding, URL parser, cache key mismatch.
- Client/browser: reflected/stored/DOM XSS, CSP bypass, postMessage, DOM clobbering, client-side path traversal, service worker/cache.
- Admin bot: report/share/preview/contact flows, authenticated bot state, navigation scheme validation, same-origin exfil.
- File/control-plane: upload, archive extraction, image/document parser, export/import, file read/write, source leak.
- SSRF/internal: webhooks, URL fetchers, PDF/renderers, metadata/internal admin APIs, DNS rebinding style clues.
- Framework: PHP/Laravel/Symfony/ThinkPHP/WordPress, Java/Spring/Shiro/Struts/MyBatis, Node/Express/Next/Nuxt, Python/Flask/Django/FastAPI.

## Pattern gate

A pattern can affect the next action only if it changes at least one of:

- the first safe check;
- the hypothesis score;
- the stop rule;
- the primitive lock condition;
- the final control plane.

## High-value client/browser chain cards

### HTML injection before scripts + CSP hash-selective execution

Signals:

- HTML injection lands before later inline scripts, often via `</title>`, template title, markdown/html render, or server-rendered name field.
- CSP is present with nonce/hash/`strict-dynamic`, and scripts are deterministic enough to hash.
- Page has multiple inline scripts where one parses attacker input, one resets/defaults/guards state, and one later renders or reaches a sink.
- Source/comment clues such as `TODO remove this script`, dirty code, early phase, challenge creator, JSON renderer, or suspicious default assignment appear.
- Client-side gadget evidence exists: `Object.entries`, `__proto__`, `constructor.prototype`, deep merge/set, `createElement`, `setAttribute`, template options, `innerHTML`, dynamic script/style tag creation.

Constraint equation:

`controlled HTML injection -> injected meta CSP/hash policy -> selected inline scripts execute while blocker script is denied -> attacker-controlled object survives -> DOM/template gadget creates script/HTML/resource -> flag/admin/secret path`

First safe check:

1. Build a Script Execution Ledger and desired bitmap, e.g. source script = execute, default/overwrite script = block, sink script = execute.
2. Compute or observe script hashes only for wanted scripts.
3. Inject a harmless `meta http-equiv="Content-Security-Policy"` that allows the wanted script hashes but excludes the overwrite/guard script.
4. Verify with browser console/DOM that the blocker script did not run and the source/sink scripts did.

Stop/pivot:

- Do not drop prototype pollution or DOM gadget evidence after one flat DOM oracle if an overwrite/default script ran after the controlled source.
- If injected CSP does not affect later scripts, test parser-state swallowing or deliberate blocker error as the next one-variable unlock probe.
- If the gadget becomes reachable, stop broad discovery and close the chain from the controlled DOM/script/resource primitive.
