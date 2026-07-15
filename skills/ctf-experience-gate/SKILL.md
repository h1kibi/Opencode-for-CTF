---
name: ctf-experience-gate
description: Use for CTF decision-layer experience gating before deep exploitation, especially when evidence is present but the solver is drifting, over-enumerating, searching for writeups, or failing to convert source/black-box observations into a primitive. Builds constraint equations, pattern recall, pivot budgets, and common chain-shape hypotheses across Web, pwn, rev, crypto, forensics, and misc.
compatibility: opencode
---

# CTF Experience Gate

This skill is not a payload catalog. It is a decision-layer gate that converts observations into constraints, primitives, or pivots. Use it when a challenge is medium/hard, source or strong black-box evidence exists, or the solver is tempted to keep exploring without a new differential.

## Agent Integration Contract

Category agents should treat this skill as the shared source for anti-drift behavior, constraint equations, semantic mismatch promotion, pattern recall timing, environment/proc budget limits, owner discipline for mixed-surface hard branches, and negative-knowledge pressure. Keep agent prompts focused on domain-specific ladders and sink families; use this skill for the reusable decision layer instead of restating the same anti-drift rules in every category prompt.

Inspired by the workflow organization of public CTF skill collections: first questions, first-pass workflow, fast pattern maps, common chain shapes, and pivot rules. Do not copy writeups; retrieve patterns.

## Execution Discipline Gate

ACTION-ONLY OVERRIDE: visible assistant text before a tool/probe must be at most one sentence. Do not output `Exploring`, `Considering`, or `Clarifying` sections. Do not narrate alternatives. Think silently, then call the next selected tool/probe. After `ctf-pattern-card-search`, immediately call `ctf-pattern-to-hypothesis` or `ctf-decision-state probe/rank`.

This gate prevents analysis paralysis. Once evidence exists, do not keep writing exploratory monologues.

Hard rules:

- After at most two short reasoning paragraphs or eight lines of analysis, do one of: call a pattern/decision tool, create a probe contract, execute one safe one-variable probe, or explicitly pivot/stop.
- If a candidate has controlled input, sink/oracle, and `first_safe_check` or `probe_template`, immediately use `ctf-pattern-to-hypothesis` or execute the first safe probe. Do not add more theory first.
- Every non-trivial branch must follow: evidence -> hypothesis -> one-variable probe -> observation -> `ctf-decision-state observe/rerank`.
- On resume after `terminated`, do not restart recon. Summarize last evidence in five lines, choose the current top hypothesis, and execute the next one-variable probe or convert the top pattern card to a hypothesis.
- Environment/directory/proc/fd/environ/maps reasoning is capped at two probes unless it produces direct flag/source/secret evidence or a new differential.
- `/proc/fd` LFI hard brake: after two failed or no-differential probes involving `/proc`, `fd`, `stdin`, `stdout`, `environ`, `maps`, `hostname`, or start-script discovery, stop that family completely. The next action must be semantic mismatch/source-guided sink analysis, parser/path/content-type differential, pattern-card conversion, or final reproduction. Do not try another fd/path variant just because it is plausible.
- If the next action is only another explanation paragraph, it is invalid. Produce a probe, pivot, or final.

## Decision-State Invocation Safety Gate

Do not call `ctf-decision-state` with placeholder, empty, or guessed parameters.

Hard rules:

- `operation` must be explicit and valid for the intended use: `init`, `rank`, `probe`, `observe`, `gate`, or `report`.
- Never call `ctf-decision-state` unless `hypothesesJson` is non-empty JSON for all operations except a final `report` that reads existing state.
- For `probe`, require a non-empty `probeJson` with exactly one-variable check.
- For `gate`, require explicit `gate`, non-empty `gateJson`, and non-empty `hypothesesJson`.
- For `observe`, require non-empty `observationJson` tied to a previously ranked hypothesis.
- If these fields are not ready, first do exactly one of: build a minimal top hypothesis, run `ctf-pattern-to-hypothesis`, or write the smallest valid queue from current evidence. Do not issue an empty controller call.
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

## Lesson-Coupled Retrieval Gate

Do not treat lessons as passive reading material. When a branch enters closure-first state, mixed-owner uncertainty, or repeated drift, explicitly check whether a local lesson already describes the situation.

Priority order:

1. matching closure lesson
2. matching owner handoff lesson
3. matching failure-signature lesson
4. matching anti-pattern lesson
5. only then broader pattern-card / skill-repo recall if the local lessons are insufficient

Hard rules:

- If a high-value primitive exists, first check the matching `closure-*.md` lesson before widening discovery.
- If the branch is mixed-surface, first check a matching `owner-*.md` lesson before keeping multiple owners alive.
- If the branch is stale or noisy, first check a matching `failure-*.md` or `anti-pattern-*.md` lesson before authoring another same-family probe.
- Lessons should change behavior: queue ranking, budget, owner selection, or closure order. If a lesson does not change any of those, do not cite it as if it were evidence.

## CTF Web Instinct Layered Decision Gate

CTF Web solving should prioritize likely challenge-intended, low-cost, high-yield paths over realistic-but-long exploit chains. Do not let confirmed but low-yield phenomena dominate the main line.

Layered priority order:

1. Challenge clues: credentials, page hints, unusual names, comments, masks, filenames, challenge text.
2. Low-cost high-yield source/data surfaces: `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, backup archives, debug/source/history leaks.
3. Source-guided sink audit: SQL sinks, file read/write sinks, include/require, unserialize, eval/template/code execution, config/secret reads.
4. Classic teaching-vulnerability mapping from code structure and dangerous functions.
5. Phenomenon-only Web bugs such as XSS, CRLF, open redirect, reflection, or weak parser differential only if they are close to flag/source/database or unlock a stronger primitive.

Source Availability Priority Gate:

- If the target looks like an old PHP site, BUU/NSS/common training platform, simple page with many interaction points, traditional directory/static resource layout, acquired login state, or artificial CTF app rather than real business, put source acquisition in the top two hypotheses.
- If source acquisition cost is lower than continuing black-box chain building, check source surfaces before deep exploit chaining: `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, backup/source archives, and recoverable git history.
- Do not spend a long branch on CRLF/XSS/parser phenomena while a cheap source-leak check remains untested.

Primitive Value Gate:

- High-value primitives: arbitrary file read, source leak, SQLi with data read, deserialization/POP, file write, SSRF to internal/source, command/code execution, config/secret read.
- Medium-value primitives: stored XSS, CRLF, open redirect, reflection, weak parser differential, header injection, UI-only state difference.
- A medium-value primitive must show a two-step route to flag/source/database/privileged state before it becomes the main line. Otherwise downgrade it after at most two no-progress probes.

Classic Function Mapping:

- `addslashes` / legacy mysql escaping -> wide-byte SQL injection or encoding/collation bypass.
- `include`, `require`, `readfile`, `file_get_contents` -> LFI, wrappers, path normalization, precheck/sink consumer mismatch.
- `file_put_contents` / upload move -> file-write chain, wrapper/filter adapter, include/webroot/session/.user.ini trigger.
- `unserialize` -> POP chain and magic-method sink mapping.
- `preg_replace /e`, `eval`, `assert`, template render with user input -> code execution/template injection.
- `header("Location: ...$input")` -> CRLF/open redirect, but keep below source/SQL/file-chain unless it reaches flag path quickly.
- Raw HTML output -> XSS/reflection, but require a clear admin-bot/secret/flag route before main-line commitment.

Black-Box Difference Correction:

Before promoting a response/page difference to the main line, answer:

1. Is it execution evidence or only reflected/data-display evidence?
2. Is it on a read path or write path?
3. Can it directly yield data echo, state change, permission change, file/source/database read, or stronger primitive?

Only-reflection evidence must not occupy the main line for long. If two same-family probes do not move closer to source/database/file/flag, downgrade and pivot.

Budget Stop-Loss:

- Two same-family probes without a new differential -> downgrade that branch.
- If 10-15 minutes or one focused mini-loop does not move closer to source/database/file/flag, force pivot.
- If an untested cheap high-yield branch exists, do not continue deepening a complex medium-value chain.

## Challenge Clue Priority Gate

Do not let generic black-box methodology override strong challenge-provided clues. If the page, title, source comment, robots, error text, placeholder, sample credential, visible username/password shape, masked string, unusual filename, parameter name, or challenge description gives a distinctive clue, treat it as a high-priority primitive candidate.

Hard rules:

- Before broad mechanism hunting, write a Clue Ledger: exact clue string, where it appears, possible role, implied structure, controlled inputs it relates to, and cheapest confirmation oracle.
- Exhaust a small, bounded clue-first budget before generic branches: usually 3-6 targeted variants, or 1-2 pattern-card/hypothesis conversions if the clue maps to a known family.
- For credential-shaped clues, do not stop after the literal value fails. Interpret masks and repetition as structure hints: prefix/suffix, fixed padding, username-derived password, leetspeak/date/common suffix, hidden length, wildcard/star placeholders, or normalization/case hints.
- A strong visible clue outranks generic black-box differentials unless clue-first probes are falsified or the clue is confirmed decoy/noise.
- After clue-first budget fails, explicitly record why the clue is exhausted before moving to login differential, source extension probing, content-type confusion, or unrelated route discovery.

## Primitive Composition Gate

When source, SSRF, LFI, debug leak, decompile output, or route tracing reveals a concrete primitive or sink, stop broad recon and try to close the exploit chain from existing pieces first.

Hard rules:

- Sink-first closure: once a sink/gadget is known, write a Primitive Ledger before looking for new routes/parameters: controlled data, controlled path/name, transform/prefix/suffix, trigger, execution context, oracle, and blockers.
- Composition before discovery: do not search for hidden routes, extra parameters, more protocols, or internal enumeration until the top two chain-closure probes for the existing primitive have failed or been falsified.
- Pattern recall by sink: immediately query local pattern cards using the concrete sink/function/class/protocol names, not only the broad bug family. Examples: `file_put_contents php filter write base64 prefix`, `file_get_contents include data scheme parser mismatch`, `__toString hasaki file_put_contents php unserialize`.
- Chain shape thinking: convert primitive -> required capability -> adapter pattern. Examples: file write -> executable write via wrapper/filter; precheck read + include sink -> parser differential; SSRF source read -> source-guided gadget closure; upload write -> include/render/static serve; deserialization gadget -> sink adapter.
- New-surface budget: after a strong primitive is found, at most one cheap new-surface check is allowed before chain closure. More discovery requires evidence that the primitive is unreachable, untriggerable, or non-composable.
- If a known sink maps to a curated pattern card, the next step must be `ctf-pattern-to-hypothesis` or a one-variable probe from that card.

## PHP Chain-Closure Patterns

High-value PHP patterns to recall before more recon:

- `file_put_contents` with controlled path/content: prioritize write adapters such as `php://filter/write=convert.base64-decode/resource=...`, path-to-webroot/include target, `.user.ini`/auto_prepend when applicable, phar/session/upload pivots when reachable. If a fixed PHP prefix/suffix pollutes content, test base64 decoder tolerance or alignment padding before abandoning the write sink.
- PHP unserialize gadget ending in file write: `__toString`, destructor, magic method, or method-call gadget plus `file_put_contents` should be modeled as controlled write first, then transformed into execution/read primitive using wrappers or reachable include/static path.
- `file_get_contents($x)` precheck followed by `include($x)` sink: prioritize protocol/parser semantic mismatch. Do not treat one `data://` failure as falsifying all `data:` behavior. Test exact scheme syntax differences such as `data:,harmless/path` versus `data://...`, wrapper normalization, and whether the precheck and include consume different resources.
- If SSRF already gave source or local-only PHP files, consider SSRF solved as a source acquisition/access primitive. Do not keep enumerating SSRF protocols unless source-guided chain closure fails.

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

Pattern recall must happen before direct writeup search when stuck. Use offline pattern cards first via `ctf-pattern-card-search`; prefer v6 cards whose `subfamilies` overlap current evidence and whose `primary_subfamily`, `subfamily_confidence`, `precondition_signals`, and `probe_template` fit the constraint equation; convert the chosen card with `ctf-pattern-to-hypothesis`; if cards are weak or too generic, fall back to the local `ljagiello/ctf-skills` mirror through `ctf-skill-repo-search` for full-text context. After the card-backed hypothesis is confirmed, falsified, misleading, weak, or leads to a flag, record `ctf-pattern-feedback`. Feedback is consumed by the v4/v5/v6 card index builders to promote useful cards and demote weak/misleading cards.

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

Title/writeup search is allowed only after a Stuck Gate triggers or for post-solve learning. If using external resources during a solve, prefer generic technique pages, public skills, offline `ctf-pattern-card-search` hits, local `ctf-skill-repo-search` hits, and pattern notes over exact challenge answers.

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

## Cross-Category Evidence Router

Use this router before spawning subagents or diving into a single category. It is inspired by the multi-skill organization of public CTF skill repositories: each category has first questions, resource families, pivot rules, and common primitive shapes.

| Evidence | Prefer | First primitive to prove | Pivot if |
|---|---|---|---|
| HTTP routes, JS, cookies, templates, APIs, browser bot | Web | read/bypass/forge/render/execute one controlled effect | source shows crypto/math/binary/forensics as real blocker |
| Native binary, crash, checksec, libc, heap, ROP, kernel | Pwn | leak, write, control RIP/function pointer, syscall, win path | behavior not understood -> reverse first |
| Obfuscated binary, APK, WASM, bytecode, VM, anti-debug | Reverse | recover validation logic, constants, state machine, transform | bug understood and exploit remains -> pwn; algorithm is crypto -> crypto |
| RSA/AES/ECC/lattice/PRNG/hash/signature/math oracle | Crypto | recover key/plaintext/nonce/seed or forge one token | artifact extraction or implementation reversing is blocker |
| PCAP, disk image, memory dump, image/audio/PDF/archive/stego | Forensics | extract artifact, stream, hidden layer, credential, or flag fragment | recovered app/binary/crypto becomes blocker |
| Jail, encoding stack, esolang, game, VM puzzle, DNS/RF oddity | Misc | escape, decode layer, solve constraints, recover protocol state | becomes web/pwn/rev/crypto/forensics dominated |

## Category First Questions

### Web

- Where is the flag likely to be: browser, API, file, DB, internal service, admin state?
- What boundary is trusted: header, cookie, route, object ID, parser, template, file path, upload metadata, callback URL?
- Are multiple parsers disagreeing: proxy/app, URL/fetcher, sanitizer/browser, checker/sink, content-type/body parser?
- What is the smallest primitive: read one file, forge one token, call one endpoint, trigger one bot visit?

### Pwn

- Do we understand the binary behavior, or should reverse run first?
- What protections matter: PIE, NX, RELRO, canary, seccomp, ASLR, libc version?
- What primitive exists: leak, overflow, format string, UAF, OOB, arbitrary read/write, syscall, win function?
- What is the shortest stable chain: ret2win, ret2libc, ROP/SROP, heap poisoning, FSOP, kernel privesc?

### Reverse

- What is the validation target: flag string, license, protocol, VM bytecode, game state, cryptographic transform?
- Is static analysis enough, or is a runtime oracle faster?
- Are there anti-analysis mechanisms: packing, ptrace, timing, signals, self-modifying code, VMProtect/Themida-like behavior?
- Can constants/transforms be extracted into a solver instead of fully decompiling everything?

### Crypto

- What are the public parameters, oracle access, and flag encoding?
- Is this textbook misuse, weak parameters, nonce/seed reuse, padding/oracle, lattice/Coppersmith, or custom algebra?
- Can known prefix/format reduce the problem?
- Is the fastest path direct math, Sage/Python modeling, z3/LLL, or protocol interaction?

### Forensics

- What artifact type is real: archive, disk, memory, pcap, image, audio, PDF, logs, registry, Docker layer?
- Is the flag direct, fragmented, encoded, hidden in metadata, carved, or recovered via timeline?
- What layer should be peeled first, and what evidence proves progress?
- If a recovered artifact is another challenge type, pivot quickly.

### Misc

- Is it encoding, jail, constraint puzzle, protocol oddity, game/VM, DNS/RF, or platform navigation?
- What is the oracle: length, comparison, timeout, error, score, server state, decoded layer?
- Can the task be modeled with z3, dynamic programming, graph search, symbolic execution, or automated interaction?
- Stop manual guessing when a solver/oracle model exists.

## Fast Pattern Map

Use this as a local pattern recall layer before external search.

### Web patterns

- Parser mismatch, template/file read, SSRF, command execution, XML/XXE, upload/write, deserialization -> server-side pattern family.
- XSS, CSP, admin bot, DOM, postMessage, browser normalization, cache poisoning -> client-side pattern family.
- JWT, cookie signing, OAuth/OIDC, SAML, IDOR, hidden admin, role/tenant confusion -> auth/access pattern family.
- Source/config leak -> secret recovery -> token/session forgery is often faster than payload brute force.

### Pwn patterns

- Crash with easy control -> ret2win/ret2libc before exotic ROP.
- Format string -> leak first, then write primitive; avoid blind overwrite before offset/oracle.
- Heap/UAF/OOB -> identify allocator/libc/tcache/fastbin/unsorted primitive before one_gadget hunting.
- Seccomp/kernel/sandbox -> enumerate allowed syscalls/objects before generic shellcode.

### Reverse patterns

- Strings/constants/imports first; then validation slice; then dynamic oracle if static is noisy.
- Custom VM -> identify instruction format, dispatch loop, state registers, and trace one sample.
- Anti-debug/packing -> bypass/dump/trace minimal region, not full unpack unless needed.
- Transform validation -> lift to Python/z3; do not decompile unrelated UI/framework code.

### Crypto patterns

- RSA -> check small factors, shared primes, small e, common modulus, close primes, leaked dp/dq/phi, broadcast, Coppersmith.
- Symmetric -> mode misuse, IV/nonce reuse, padding oracle, ECB/cut-paste, CBC bitflip, GCM nonce reuse.
- PRNG -> seed/time, LCG/MT/LFSR state recovery, partial outputs, known plaintext.
- Lattice/ECC/ZKP -> identify dimension, leakage type, subgroup/order, reused nonce, invalid curve, setup trust.

### Forensics patterns

- File/archive -> magic bytes, embedded files, trailing data, safe extraction, flag grep.
- PCAP -> HTTP/DNS/TCP streams, credentials, uploaded/downloaded files, timing/covert channels.
- Disk/memory -> process list, filescan, registry/logs, deleted files, browser artifacts, Docker layers.
- Media/stego -> metadata, bitplanes, palettes, frames, audio spectrogram, QR/barcode, overlay/trailing data.

### Misc patterns

- Encoding stack -> identify charset/alphabet/entropy/magic bytes; automate layered decode.
- Pyjail/bashjail -> enumerate allowed syntax/builtins, oracle, object graph, environment, no-call/no-quote bypass families.
- Game/VM/constraint -> model state transitions; use z3/DP/search rather than manual play.
- CTF platform/navigation -> use API/state carefully; separate platform hints from challenge artifacts.

## Knowledge Use Policy

The public skill repository is a pattern catalog, not an answer oracle. Use it to improve:

- initial questions,
- category routing,
- first primitive selection,
- pattern-family recall,
- pivot timing,
- tool prerequisites,
- and common chain-shape ranking.

Do not blindly copy long payload catalogs into the prompt. Retrieve deep technique notes only when the local evidence triggers that family. If adding future local references from public resources, keep them as concise pattern cards with trigger, first safe check, stop rule, and pivot rule. Use `ctf-skill-repo-knowledge` for the retrieval contract, `ctf-pattern-card-search` for decision-first offline cards, `ctf-pattern-to-hypothesis` to convert a chosen card into `ctf-decision-state` JSON, `ctf-skill-repo-search` for full-text lookup in the complete local mirror, `ctf-pattern-feedback` for solved/failed/retro learning, and `ctf-pattern-curation-report` to identify cards that should be promoted, demoted, tightened, or converted into curated cards. Rebuild v9 after accumulating feedback so semantic tokens, semantic ngrams, evidence phrases, semi-curated status, curation tiers, review recommendations, multi-label subfamilies, confidence, concepts, aliases, and probe templates stay current. Review `curation-candidates.json` for the top 220 non-curated cards that should be manually or LLM-assisted refined next; v9 uses these as semi-curated ranking inputs while keeping the review recommendation visible.

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
