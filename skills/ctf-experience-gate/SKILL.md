---
name: ctf-experience-gate
description: Use for CTF decision-layer experience gating when evidence exists but the solver is drifting, over-enumerating, searching for writeups, or failing to convert observations into a primitive.
compatibility: opencode
---

# CTF Experience Gate


## Load When

Load before using recalled patterns, lessons, benchmark knowledge, or a speed-lane shortcut to influence the current route.

## Do Not Load When

Do not use recall to replace live evidence, to invent a flag path, or to bypass the current category's first safe probe and evidence gate.

## Required Inputs

Require the current phase, at least two concrete case signals, known constraints, failed paths, and the retrieval source or tool that produced any lesson/pattern hit.

## First Safe Action

Separate confirmed facts from candidate analogies, then apply recall only as a ranking modifier with an explicit verification probe.

## Dispatch / Handoff

Return modified route scores and the discriminator that would falsify the recalled pattern to `ctf-decision-engine` and the active category owner.

This skill is not a payload catalog. It is a decision-layer gate that converts observations into constraints, primitives, or pivots. Use it when a challenge is medium/hard, source or strong black-box evidence exists, or the solver is tempted to keep exploring without a new differential.

## Agent Integration Contract

Category agents should treat this skill as the shared source for anti-drift behavior, constraint equations, semantic mismatch promotion, pattern recall timing, environment/proc budget limits, owner discipline for mixed-surface hard branches, and negative-knowledge pressure. Keep agent prompts focused on domain-specific ladders and sink families; use this skill for the reusable decision layer instead of restating the same anti-drift rules in every category prompt.

Inspired by the workflow organization of public CTF skill collections: first questions, first-pass workflow, fast pattern maps, common chain shapes, and pivot rules. Do not copy writeups; retrieve patterns.

## Execution Discipline Gate

ACTION-ONLY OVERRIDE: visible assistant text before a tool/probe must be at most one sentence. Do not output `Exploring`, `Considering`, or `Clarifying` sections. Do not narrate alternatives. Think silently, then call the next selected tool/probe. After a `ctf_rag` recall, immediately call `ctf-decision-state probe/rank` or execute the first safe check it implies.

This gate prevents analysis paralysis. Once evidence exists, do not keep writing exploratory monologues.

Hard rules:

- After at most two short reasoning paragraphs or eight lines of analysis, do one of: call `ctf_rag` or `ctf-decision-state`, create a probe contract, execute one safe one-variable probe, or explicitly pivot/stop.
- If a candidate has controlled input, sink/oracle, and `first_safe_check` or `probe_template`, immediately execute the first safe probe. Do not add more theory first.
- Every non-trivial branch must follow: evidence -> hypothesis -> one-variable probe -> observation -> `ctf-decision-state observe/rerank`.
- On resume after `terminated`, do not restart recon. Summarize last evidence in five lines, choose the current top hypothesis, and execute the next one-variable probe.
- Environment/directory/proc/fd/environ/maps reasoning is capped at two probes unless it produces direct flag/source/secret evidence or a new differential.
- `/proc/fd` LFI hard brake: after two failed or no-differential probes involving `/proc`, `fd`, `stdin`, `stdout`, `environ`, `maps`, `hostname`, or start-script discovery, stop that family completely. The next action must be semantic mismatch/source-guided sink analysis, parser/path/content-type differential, one `ctf_rag` recall, or final reproduction. Do not try another fd/path variant just because it is plausible.
- If the next action is only another explanation paragraph, it is invalid. Produce a probe, pivot, or final.

## Decision-State Invocation Safety Gate

Do not call `ctf-decision-state` with placeholder, empty, or guessed parameters.

Hard rules:

- `operation` must be explicit and valid for the intended use: `init`, `rank`, `probe`, `observe`, `gate`, or `report`.
- Never call `ctf-decision-state` unless `hypothesesJson` is non-empty JSON for all operations except a final `report` that reads existing state.
- For `probe`, require a non-empty `probeJson` with exactly one-variable check.
- For `gate`, require explicit `gate`, non-empty `gateJson`, and non-empty `hypothesesJson`.
- For `observe`, require non-empty `observationJson` tied to a previously ranked hypothesis.
- If these fields are not ready, first do exactly one of: build a minimal top hypothesis or write the smallest valid queue from current evidence. Do not issue an empty controller call.
- Visible output before a controller call should be at most one sentence naming the chosen action.

## Scoreboard Speed Lane

Use this lane when the goal is online competition scoring, early triage, or the challenge looks easy/medium with obvious surfaces. It prevents over-processing simple tasks.

First 8-12 minute priority order:

1. Challenge description and page clues: usernames, passwords, masks, versions, filenames, roles, odd strings, flag format hints.
2. Low-cost source/data surfaces: `robots.txt`, `sitemap.xml`, `/.well-known/`, `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, source maps, backup archives, debug/config routes.
3. Frontend/static leakage: JS bundles, source maps, env/config literals, hidden routes, GraphQL operations, admin path literals, feature flags.
4. Default/weak auth and credential structure: default creds, clue-derived password variants, public admin-login cookie seeding, weak signed cookies/JWT shape.
5. Obvious direct primitives: file read, source leak, debug console, SQL error/auth bypass, LFI wrapper, upload served path, exposed flag/config/secret, admin token.
6. Artifact/direct flag checks when attachments or local files exist: triage, archive extract, strings, flag grep, source grep.

Speed lane rules:

- If a direct flag/source/secret/admin-token path appears, return early with minimal reproduction; do not enter full queue.
- Use at most 1-2 low-cost probes per obvious surface family before moving to the next speed-lane family.
- Do not start deep CRLF/XSS/cache/race/request-smuggling/GraphQL exploitation in speed lane unless it directly exposes flag/source/secret or is the only visible clue.
- If no direct path appears after the time box or the target is clearly multi-stage/stateful, enter full decision-state workflow.

## Non-PHP Web Classic Instinct Map

Use this map when evidence points outside classic PHP. Treat framework/runtime names, headers, dependency leaks, error pages, JS bundle strings, route names, and source snippets as high-value signals.

Admin-bot/XSS Promotion Gate:

- Promote XSS/client-side bugs to main line only when there is bot/report/preview/share/admin visit evidence, privileged browser state, same-origin secret endpoint, CSP/storage/cookie clue, postMessage sink, or a callback/exfil oracle.
- First safe check is a harmless bot/runtime canary: visit proof, origin, cookie/storage visibility, CSP, and reachable same-origin endpoints. Do not send repeated payload variants before this model exists.
- Stored/self-XSS without bot/secret route remains medium-value and should not outrank source/data/file primitives.

JWT/JWE/OAuth Token Gate:

- JWT-like token, JWK/JKU/KID headers, alg field, kid path, jku URL, jwk object, weak secret, none/HS-RS confusion, or public key leakage should immediately trigger token-shape classification before generic auth fuzzing.
- First safe checks: decode header/payload; identify alg/kid/jku/jwk; test role/expiry claim significance without forging; search for public keys/JWKS; check whether KID is used as path/key lookup; check JKU host trust.
- OAuth/OIDC/SAML flows prioritize redirect_uri, state/nonce binding, open redirect chaining, token leakage, and issuer/audience confusion.

GraphQL Gate:

- `/graphql`, GraphiQL/Apollo errors, JSON body with `query`, operationName, introspection-like errors, or frontend GraphQL operations trigger schema/operation modeling.
- First safe checks: introspection, `__typename`, batching/aliasing behavior, authz on object IDs, query depth/cost limits, mutation side effects, and whether server-side query construction interpolates strings.
- Treat GraphQL as API surface plus authz/state machine, not just injection syntax.

Node/Express/Prototype Pollution Gate:

- Node/Express, merge/clone/deep-set libraries, `__proto__`, `constructor.prototype`, JSON body merge, template options, vm/sandbox, EJS/Pug/Handlebars, or dependency/version leak triggers prototype-pollution and sandbox mapping.
- First safe checks: harmless pollution of a visible config/property; options object influence; template/debug setting gadget; middleware path/proxy trust mismatch; vm escape only after sandbox evidence.

Flask/Python Gate:

- Flask/Jinja/Werkzeug, signed session cookie, SECRET_KEY leak, debug console, `render_template_string`, `.format()` on user input, pickle/joblib/shelve, or `/console` traces trigger Python framework mapping.
- First safe checks: Jinja/Twig-like arithmetic fingerprint, Flask session decode/signing feasibility, Werkzeug debug PIN prerequisites, `.format()` attribute traversal, pickle marker/base64 classification.

Java/Spring Gate:

- Spring Boot/Thymeleaf/SpEL/Actuator, Java serialized object, XML xsi:type, Jackson/Fastjson, JNDI/RMI, or Java stack traces trigger Java mapping.
- First safe checks: actuator/env/heapdump exposure, template expression arithmetic, file-read via framework utilities such as FileCopyUtils when shell is blocked, serialized stream magic, URLDNS-style blind deserialization confirmation.

Go/Template/Path Gate:

- Go templates, Pongo2, `html/template`, `text/template`, path cleaning, rune/byte length checks, Unicode normalization, or `filepath.Clean`/router mismatch triggers Go parser/semantic differential mapping.
- First safe checks: template arithmetic/field access, path-clean encoded slash/dot variants, rune-vs-byte length boundary, Unicode homoglyph/case-folding discrepancy.

Cache/Proxy/CDN Gate:

- CDN/cache headers, X-Forwarded-Host, Host trust, request smuggling signs, cache hit/miss, CRLF in headers, CSP/header injection, or shared cache behavior triggers cache-key/proxy model.
- First safe checks: cacheability and key dimensions with harmless markers; Host/XFH influence; path/query normalization; header/body boundary; only promote if it can poison content seen by admin/bot/users or expose secret/source.

Race/Concurrency Gate:

- Coupon, redeem, refund, transfer, stock, quota, invite, registration uniqueness, file extraction cleanup, balance checks, and webhook trigger flows should trigger TOCTOU/race modeling when check and action appear separable.
- First safe check: identify one idempotency/state variable and send a tiny bounded concurrent batch with harmless value or duplicate action; compare whether all requests observed pre-update state. Do not brute-force concurrency before state transition and rollback/cleanup risk are understood.
- Promote race only when it can duplicate value, bypass uniqueness, win cleanup window, or expose source/flag/state within a short path.

Realtime/WebSocket/SSE Gate:

- `ws://`, `wss://`, Socket.IO, SSE/EventSource, room/channel IDs, namespace names, hidden event strings, or JSON event handlers trigger realtime API modeling.
- First safe checks: enumerate event names from JS, connect with current cookie/token, compare anonymous/user/admin-like state, test room/channel object IDs for authz, and try harmless mass-assignment fields such as role/isAdmin only when state damage is low.
- Treat WebSocket/SSE as API routes with state and authz; do not ignore them because they are not normal HTTP forms.

CORS/Cross-Origin Boundary Gate:

- `Access-Control-Allow-Origin`, reflected Origin, `Access-Control-Allow-Credentials`, null origin, iframe sandbox, opener, postMessage, service worker scope, or JSONP/XSSI evidence triggers cross-origin boundary modeling.
- First safe checks: test harmless Origin reflection with and without credentials, `null` origin behavior, exact postMessage origin validation, iframe/opener reachability, service worker scope, and whether GET endpoints can be read/exfiltrated through script/image/prefetch channels.
- Promote only if cross-origin behavior reaches token/secret/admin state or chains with OAuth/admin-bot/GraphQL/JSONP.

NoSQL/ORM/Search Injection Gate:

- MongoDB/Mongoose, `$where`, `$regex`, `$ne`, `$gt`, JSON filters, Prisma/ORM filter objects, Elasticsearch/Lucene/Meilisearch query strings, Cypher/Gremlin, Redis command shaping, or GraphQL-to-DB resolver clues trigger non-SQL query injection modeling.
- First safe checks: type confusion/object-vs-string in JSON body, harmless operator injection, regex/timing oracle, filter key allowlist bypass, and whether client-side filters map directly to backend query objects.
- Do not treat SQLi failure as injection-family falsification when the backend is NoSQL/ORM/search.

Cloud/Container/CI/Third-Party Gate:

- Docker socket/API, Kubernetes serviceaccount/API, cloud metadata, `.env`, health/metrics/debug endpoints, CI artifacts/logs, object storage buckets, subdomain takeover fingerprints, webhook/OAuth app integrations, analytics/support widget tokens, or CI/CD variables trigger deployment-surface modeling.
- First safe checks: identify environment from headers/errors/JS/config; test harmless metadata/debug/health endpoints; check exposed `.env`/git history/CI logs; classify object storage/subdomain takeover signal; model SSRF-to-metadata/Docker/K8s path before exploitation.
- Promote when it yields credentials, source, internal admin access, object storage control, or service token pivot.

Request Smuggling/Splitting Gate:

- TE/CL ambiguity, duplicate `Content-Length`, `Transfer-Encoding` variants, hop-by-hop headers, proxy/cache frontends, chunked boundary oddities, CRLF header/body split, or inconsistent keep-alive behavior triggers HTTP parser differential modeling.
- First safe check: use a harmless marker and low-volume desync/cache boundary probe; distinguish request splitting, cache poisoning, and backend-only reachability. Do not run destructive smuggling attempts without a clear oracle and isolation.

Evidence and Replay Gate:

- Maintain a compact Evidence Ledger for non-trivial Web solves: key URLs, routes, object IDs, cookies/tokens, roles, request templates, response oracles, confirmed/falsified hypotheses, and next replay command.
- After a branch is confirmed, produce or update a minimal reproducible `curl` or Python `requests` skeleton before deepening the chain, especially for authz, race, GraphQL, upload, token, and workflow bugs.
- A final path should include: setup/auth, trigger, observe, extract flag/source/secret, and cleanup/no-state-damage note when relevant.

## Mixed-Owner Hard-Mode Gate

Use this gate when the challenge has meaningful evidence across categories or surfaces: Web + Java, Web + Rev, Web + Crypto, Web + Forensics, source + runtime, service + attachment, or UI + internal protocol.

Do not keep multiple owners alive implicitly. Write an Owner Matrix:

| Surface | Evidence | Why not primary | Supporting role | Handoff trigger | Return trigger | Closure owner |
|---|---|---|---|---|---|---|

Hard rules:

- Choose exactly one `primary owner` and at most one `supporting surface` during active solving.
- The primary owner must explain either the current best sink/oracle or the highest-probability closure path.
- A supporting surface is allowed only if it materially supplies one of: source, route map, parser model, decompile aid, token semantics, file format understanding, or closure dependency.
- If a supporting surface now explains the sink/oracle/closure path better than the current owner, perform a deliberate owner handoff instead of letting both remain co-primary.
- Record a `closure_owner` explicitly once a primitive is confirmed. The closure owner is the surface expected to carry primitive-to-flag completion.

Useful owner examples:

- Web primary, Java support: when the trigger surface is HTTP but the sink, config, or bytecode route is owned by Spring/JAR behavior.
- Java primary, Web support: when the browser/app only exposes the transport layer and the real reasoning is actuator/template/deserialization/file-read behavior.
- Web primary, Crypto support: when token signing/verification is only a means to unlock authz or admin state.
- Web primary, Rev support: when a downloaded client, APK, or script reveals route/secret/transform clues but does not own the final closure path.

## Negative-Knowledge Gate

Use negative knowledge proactively. Hard CTF drift often happens not because a family is impossible, but because it is strategically weak under the current evidence.

Write a Negative Knowledge note when any of these appear:

- reflection without a bot/secret/runtime/exfil route
- source already acquired, but queue still dominated by blind black-box phenomena
- SSRF already yielded source/config, but exploration continues as if information were still missing
- JWT is decodable but there is no trust-boundary or key-control evidence
- GraphQL exists, but no authz/object/state/value path is visible
- deserialization payload ideas exist, but no stream/gadget/sink evidence is present
- Webshell/RCE fascination remains, but current primitive can likely read the flag/config directly

Template:

| Family | Why it looked promising | Why it is strategically weak now | Better closure family | Revisit trigger |
|---|---|---|---|---|

Hard rules:

- Negative knowledge should reduce not only confidence, but also priority and allowed probe budget.
- A family with strong negative knowledge gets at most one new orthogonal check before demotion unless new evidence appears.
- Do not keep a medium-value branch alive only because it is familiar or expressive.

## Closure-First Hard Branch Gate

Once a high-value primitive exists, ask first whether the challenge is still an exploration problem or has become a closure problem.

Treat the branch as closure-first when any of these are true:

- source or config is already readable
- arbitrary file read or strong local read path exists
- admin/session control is confirmed
- SSRF/internal access already exposes likely privileged routes
- database read is available
- write primitive exists with a plausible read/execute/render trigger
- a checker/transform/oracle is already understood well enough that the remaining task is extraction or completion

When closure-first is true:

- prioritize `closure_delta` over generic curiosity
- freeze medium-value side families unless they directly unlock the existing blocker
- write a Primitive Ledger and a Flag/Closure Queue before any new discovery branch

Primitive Ledger:

| Primitive | Current privilege | Directly reachable assets | Main blocker | Best closure path | One-variable closure probe |
|---|---|---|---|---|---|

## Failure-Signature Capture Gate

When a hard branch is demoted, do not only say it failed. Capture the failure signature in a reusable way.

Template:

| Failure signature | Trigger | Misleading signal | Earlier kill signal | Better next probe |
|---|---|---|---|---|

Common signatures worth capturing:

- medium-value primitive drift
- source available but not prioritized
- branch not killed after flat differentials
- owner should have switched earlier
- primitive confirmed but no closure model was written
- repeated environment/proc enumeration without a new differential

This turns hard-solve pain into reusable anti-pattern knowledge instead of only one challenge retrospective.

## Retrieval-Coupled Gate

Do not treat retrieved evidence as passive reading material. When a branch enters closure-first state, mixed-owner uncertainty, or repeated drift, explicitly query `ctf_rag` to check whether the corpus already describes the situation.

Priority order:

1. matching closure evidence
2. matching owner-handoff evidence
3. matching failure-signature evidence
4. matching anti-pattern evidence
5. only then broader `ctf_rag` recall if those hits are insufficient

Hard rules:

- If a high-value primitive exists, first check the matching closure evidence before widening discovery.
- If the branch is mixed-surface, first check matching owner-handoff evidence before keeping multiple owners alive.
- If the branch is stale or noisy, first check matching failure-signature or anti-pattern evidence before authoring another same-family probe.
- Retrieved hits should change behavior: queue ranking, budget, owner selection, or closure order. If a hit does not change any of those, do not cite it as if it were evidence.

## Web Instinct and Closure Gate

For Web branches where source acquisition, clue-first probing, medium-value phenomena, or PHP closure patterns compete, read `references/web-instinct-and-closure.md` and apply only the subsection matching current evidence.

## Core Principle

Before trying another payload, write the challenge as a compact equation:

| Field | Value |
|---|---|
| Flag sink / likely location | browser, API, file, DB, internal service, binary output, encoded artifact |
| Controlled inputs | query, body, header, cookie, file, object ID, ciphertext, binary arg, UI event |
| Precheck / validator | filter, parser, sanitizer, signature, authz, checksum, bounds check |
| Sink / semantic consumer | include, template, SQL, shell, SSRF fetcher, browser, deserializer, crypto equation, decompressor |
| Transform chain | decoding, normalization, canonicalization, serialization, compression, hashing, path join |
| Oracle | status, length, error, timing, file created, state transition, crash, flag-like output |
| Desired mismatch / primitive | read, write, execute, forge, leak, bypass, decrypt, control flow |

If this table is empty, return to recon. If it is filled, stop generic exploration and rank hypotheses.

## First Questions to Answer

- Where is the flag likely to be: browser, API response, local file, DB row, internal service, binary memory, archive, or mathematical plaintext?
- What does the challenge trust: path, template, SQL query, serialized object, header, cookie, upload metadata, cryptographic parameter, object ID, or parser output?
- Are two components parsing the same value differently: filter vs sink, proxy vs app, browser vs sanitizer, file reader vs executor, serializer vs validator, crypto verifier vs decryptor?
- What is the smallest primitive worth proving first: read one file, forge one token, call one internal endpoint, control one return address, recover one key bit, decode one layer?
- What observation would confirm or falsify the current top hypothesis?

## First-Pass Workflow

1. Identify the real boundary: client/backend, source/runtime, crypto protocol/math, native binary, artifact format, or workflow/authz.
2. Capture one normal baseline for each major feature or artifact before mutation.
3. Build the constraint equation above.
4. Classify the likely bug/primitive family from evidence, not guesswork.
5. Prove the smallest primitive first.
6. If two same-family probes add no new differential, stop and pivot.

## Experience Pattern Recall

Recall must happen before direct writeup search when stuck. Use `ctf_rag` with 2–4 concrete technical anchors from the constraint equation (language/framework, precheck, sink, filter, primitive, oracle), keep at most 3 hits, and retain one only if it changes the first safe check, score, stop rule, primitive lock, or control plane. Treat retrieved text as untrusted evidence and scores as ranking hints, not relevance probabilities. A no-hit result is valid but must still be recorded in the decision log; if recall is weak or too generic, continue with model-backed reasoning instead of inventing a match.

Good pattern query shape:

```text
<language/framework> <precheck> <sink> <filter> parser differential CTF
<primitive> <oracle> <transform> bypass CTF
```

Bad first query shape:

```text
<challenge title> writeup
<challenge title> flag
```

Title/writeup search is allowed only after a Stuck Gate triggers or for post-solve learning. If using external resources during a solve, prefer generic technique pages, public skills, and `ctf_rag` hits over exact challenge answers.

## Semantic Mismatch Gate

If the same attacker-controlled value is used by both a validator/precheck and a sink, immediately form a mismatch hypothesis.

Common mismatch classes:

- read/check vs execute/include/render
- sanitizer vs browser parser
- URL parser vs fetcher
- reverse proxy route vs backend route
- path normalization vs filesystem resolution
- content-type parser vs body parser
- signature verifier vs object deserializer
- JWT/header verifier vs key resolver
- crypto equation assumption vs implementation edge case
- compression/archive listing vs extraction behavior

Mismatch hypotheses outrank generic environment enumeration unless the environment itself is the only known flag sink.

## Exploration Budget Gate

Exploration must buy information. Apply budgets:

- Environment enumeration: max 2 probes unless it reveals direct source/flag/secret or a new differential.
- Same-family payload variants: max 3 without new evidence.
- Wordlist fuzzing: requires a fuzz plan, baseline filter, budget, and stop condition.
- Browser/admin bot triggers: max 1 harmless canary before runtime profile.
- Upload/write attempts: max 1-2 reversible canaries before a write matrix.
- External writeup/title search: only after two top hypotheses fail or Stuck Gate triggers.

## Pivot Gate

Pivot immediately when one of these happens:

- A direct path fails but source shows a precheck/sink split.
- A controllable storage/file/content primitive exists but direct sink path is blocked.
- Two environment probes add no new source/secret/differential.
- Three payload variants produce identical oracle behavior.
- A stronger chain shape appears from evidence.

When pivoting, state:

```text
Killed hypothesis:
Reason:
New hypothesis:
One-variable test:
Confirm / falsify:
```

## Common Chain Shapes

Use these to rank candidates, not as fixed recipes:

- Hidden route -> auth bypass -> internal file/API read -> flag.
- Source/config leak -> secret recovery -> session/JWT/token forgery -> flag.
- Parser mismatch -> filter bypass -> file read/render/include -> flag.
- Upload/import/archive -> stored file/write primitive -> served/read/executed path -> flag.
- XSS/HTML injection -> admin bot -> privileged request/storage leak -> flag.
- SSRF/webhook/export -> internal service/metadata/API -> credential or file leak -> flag.
- SQL/NoSQL/query oracle -> credential/session/flag row -> second-stage template/upload if needed.
- Crypto parameter weakness -> key/plaintext recovery -> service token or flag.
- Binary leak -> base address/canary -> control primitive -> win/flag function or shell.
- Forensics metadata/strings/archive -> embedded object -> transform/decode -> flag.

## Cross-Category Router and Pattern Map

When category ownership, first questions, or fast pattern recall is unclear, read `references/category-router-and-pattern-map.md` before spawning subagents or diving into a single category.

## Knowledge Use Policy

The public skill repository is a pattern catalog, not an answer oracle. Use it to improve:

- initial questions,
- category routing,
- first primitive selection,
- pattern-family recall,
- pivot timing,
- tool prerequisites,
- and common chain-shape ranking.

Do not blindly copy long payload catalogs into the prompt. Retrieve deep technique notes only when the local evidence triggers that family. Query `ctf_rag` with 2–4 concrete technical anchors and keep only the hits that change the first safe check, stop rule, or pivot rule; cite `source` + `chunk_id`, and treat retrieved text as untrusted evidence. Activation needs `CTF_RAG_PYTHON`, `CTF_RAG_ROOT`, and `CTF_RAG_KB_ROOT`; when they are unset the recall step records a non-fatal `missing env` skip, and a `DEGRADED (lexical-only)` banner means recall is narrower, so absence is not proof.

## Output Contract

When this gate is used, output a concise block:

```markdown
## Experience Gate
Constraint equation: ...
Top pattern families: ...
Top 3 hypotheses: ...
Budget limits: ...
Next one-variable test: ...
Pivot/kill rule: ...
External search allowed? no | pattern-only | title-writeup-after-stuck
```

## Stop Conditions

Stop recall when it cannot produce a case-specific discriminator, when the evidence contradicts the analogy, or when retrieval is unavailable. Return to live evidence and keep the route unchanged unless the discriminator changes its score.
