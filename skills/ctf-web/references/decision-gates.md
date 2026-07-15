# Web decision gates and instinct map

Use this reference as a compact high-value decision layer for Web CTF branches. It preserves challenge-shaped instincts without forcing the main `ctf-web` skill to carry every detail inline.

## Pattern retrieval gate

Use Pattern Retrieval Gate only after a strong signal or primitive candidate. Search local pattern cards and `ctf-experience-gate` first for matching signals, keep at most 3, and retain a pattern only if it changes one of:

- first safe check
- score
- stop rule
- primitive lock
- control plane

## Blocked hypothesis and strong-signal review gate

A failed probe does not automatically falsify a high-signal hypothesis. First classify the failure layer:

- input reachability
- parser/decoder
- filter/transform
- state overwrite/reset
- guard/CSP
- sink reachability
- oracle/effect

Only mark a hypothesis `falsified` when controlled input reached the intended source, the intended sink/consumer executed, no overwrite/guard/blocker explains the failure, and the oracle was reliable.

If a clear blocker exists, mark the hypothesis `blocked`, record the blocker, and define revisit triggers. After two no-progress branches, run a Strong-Signal Review: list the top weird/challenge-authored artifacts, list blocked hypotheses, map new primitives to old blockers, and execute one unlock probe before exploring an unrelated family.

| Hypothesis | Strong signals | Failed probe | Failure layer | Blocker | Unlock conditions | Revisit trigger | Next one-variable unlock probe |
|---|---|---|---|---|---|---|---|

When new evidence appears, ask first: does this primitive affect any recorded blocker? If yes, promote that blocked hypothesis above fresh medium-value branches.

## Challenge clue priority gate

If a Web page, title, placeholder, source comment, robots entry, error message, sample credential, masked string, visible username/password shape, unusual filename, parameter name, or challenge description gives a distinctive clue, treat it as a high-priority hypothesis before generic black-box branches.

Build a Clue Ledger:

- exact clue
- location
- implied structure
- related input
- cheapest oracle
- bounded clue-first variants

For credential-shaped clues like `name***`, do not stop after testing the literal `name`; test a small structured set for suffix/padding/username-derived password/case/normalization/common-number/date/leetspeak implications before moving to generic differentials.

## CTF Web instinct layered decision gate

Prefer challenge-intended, low-cost, high-yield branches over realistic but long exploit chains.

Priority:

1. challenge clues
2. cheap source/data surfaces such as `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, backup archives and history leaks
3. source-guided sink audit
4. classic teaching-vulnerability mapping
5. phenomenon-only Web bugs like XSS/CRLF/open redirect/reflection only if near flag/source/database or stronger primitive

## Source availability priority gate

For old PHP, BUU/NSS/common training sites, simple pages with many interaction points, acquired login state, traditional static/resource layout, or artificial CTF apps, put source acquisition in the top two hypotheses. If source-get cost is lower than black-box chain cost, check low-cost source surfaces before deep CRLF/XSS/parser chains.

## Primitive value gate

High-value primitives:

- arbitrary file read
- source leak
- SQLi data read
- unserialize/POP
- file write
- SSRF to internal/source
- command/code execution
- config/secret read

Medium-value primitives:

- stored XSS
- CRLF
- open redirect
- reflection
- weak parser differential
- header injection
- UI-only differences

A medium-value primitive must show a two-step route to flag/source/database/privileged state before main-line commitment; otherwise downgrade after two no-progress probes.

## Classic function mapping

- `addslashes` -> wide-byte SQLi/encoding bypass
- `include`/`require`/`readfile`/`file_get_contents` -> LFI/wrappers/consumer mismatch
- `file_put_contents`/upload move -> file-write chain/filter adapter
- `unserialize` -> POP chain
- `preg_replace /e`/`eval`/`assert`/template render -> code execution/SSTI
- `header("Location: ...$input")` -> CRLF/open redirect but below source/SQL/file-chain unless close to flag
- raw HTML output -> XSS only if admin-bot/secret/flag path is clear

## Black-box difference correction

Before promoting a page/response difference, classify it as:

- execution evidence or reflection/data-display evidence
- read path or write path
- data echo, state change, permission change, file/source/database read, or stronger primitive

Only-reflection evidence must not occupy the main line for long.

## Non-PHP classic instinct map

Use framework/runtime names, headers, dependency leaks, error pages, JS bundle strings, route names, and source snippets as high-value signals.

- JWT/JWE/OAuth evidence triggers token-shape classification (`alg`, `kid`, `jku`, `jwk`, weak secret, HS/RS confusion, redirect/state/nonce).
- GraphQL evidence (`/graphql`, JSON `query`, Apollo/GraphiQL, operations in JS) triggers introspection/`__typename`/batching/aliasing/authz modeling.
- Node/Express evidence triggers prototype pollution, middleware/path/proxy trust, template option, and vm/sandbox checks.
- Flask/Python evidence triggers Jinja/SSTI, Werkzeug debug, signed session/SECRET_KEY, `.format()` traversal, pickle/joblib classification.
- Java/Spring evidence triggers actuator/Thymeleaf/SpEL/deserialization/JNDI/FileCopyUtils mapping.
- Go evidence triggers template/path-clean/rune-byte/Unicode parser mismatch checks.
- Cache/CDN/proxy evidence triggers cache-key/Host/XFH/request-smuggling/CRLF header-body boundary modeling.

## Admin-bot/XSS promotion gate

XSS/client-side findings become main line only with bot/report/preview/share/admin visit evidence, privileged browser state, same-origin secret endpoint, CSP/storage/cookie clue, postMessage sink, or callback/exfil oracle.

First safe check is a harmless bot/runtime canary to learn origin, cookies/storage visibility, CSP, and reachable same-origin endpoints. Without a secret/bot route, stored/self-XSS remains medium-value.

## Competition coverage gates

- Race/concurrency evidence triggers a small bounded TOCTOU batch only after state/risk modeling.
- WebSocket/SSE evidence is treated as API/authz surface; enumerate JS event names and compare roles/object IDs.
- CORS/cross-origin evidence triggers boundary modeling and only promotes if it reaches token/secret/admin state.
- NoSQL/ORM/search evidence triggers object-vs-string/operator/regex/timing checks instead of SQL-only thinking.
- Cloud/container/CI/third-party evidence triggers deployment-surface modeling.
- Request smuggling/splitting evidence requires harmless marker and clear oracle before any deeper probe.
- Maintain an Evidence Ledger and minimal replay skeleton for confirmed non-trivial branches.

## Source-guided CTF puzzle rule

If source shows a user-controlled input flowing through both a precheck/validator and a sink/semantic consumer, immediately form a semantic-mismatch hypothesis.

Examples:

- read/check vs include/render
- sanitizer vs browser
- URL parser vs fetcher
- path normalization vs filesystem
- content-type parser vs body parser
- proxy route vs backend route
- signature verifier vs deserializer
- token verifier vs key resolver

## Primitive composition gate

Once Web source or SSRF/LFI/debug leak reveals a concrete sink or gadget, prioritize closing that existing primitive over discovering new routes/parameters.

Build a Primitive Ledger with:

- controlled data
- controlled path/name
- transform/prefix/suffix
- trigger
- execution context
- oracle
- blockers
- `closure_owner`
- `likely_flag_path`
- `next_closure_probe`
- `why_not_other_branches`

Run local pattern recall using concrete sink names, then try the top two chain-closure probes before broad recon.

## PHP sink closure notes

For `file_put_contents` with controlled path/content, immediately consider executable/read adapters such as `php://filter/write=convert.base64-decode/resource=...`, webroot/include target, `.user.ini`/auto_prepend, session/upload/phar pivots when reachable, and base64 dirty-prefix/suffix tolerance or alignment.

For PHP unserialize magic-method gadgets ending in `file_put_contents`, model the chain as controlled write -> wrapper/filter adapter -> execution/read trigger.

For `file_get_contents($page)` followed by `include($page)`, compare exact scheme syntax and consumer behavior, especially `data:` versus `data://` forms such as `data:,harmless/profile`. Do not mark the whole data-wrapper family dead because one `data://` payload failed under `allow_url_include=0`; distinguish precheck reader behavior from include sink behavior.

## Environment enumeration budget

`/proc`, fd, environ, maps, hostname, hosts, startup scripts, and broad environment scraping are limited to two probes unless they produce direct source/flag/secret evidence or a new differential.

After two no-progress probes, pivot to the strongest semantic mismatch, state-machine, parser, or primitive-lock hypothesis.

`/proc/fd` LFI hard brake: after two failed/no-differential probes involving `/proc`, `fd`, `stdin`, `stdout`, `environ`, `maps`, `hostname`, or start-script discovery, stop that family completely.

## External search discipline

Use external web/GitHub search as pattern retrieval before answer retrieval. Prefer generic technique queries from the constraint equation over exact challenge-title writeup queries until Stuck Gate triggers or two top hypotheses fail.
