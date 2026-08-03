---
name: ctf-web
description: Use for authorized Web CTF challenges involving HTTP services, source review, routing, authentication, cookies, sessions, APIs, templates, upload handling, SSRF, SQL injection, XSS, SSTI, LFI, IDOR, JWT, deserialization, or browser interaction.
compatibility: opencode
---

# CTF Web Orchestrator

Core rule: Start every Web challenge in recon phase. Map the full attack surface before exploiting any one bug class. Progress through the solve state machine: recon → attack-queue → focused-probe → primitive-lock → control-plane → final-chain → retro.

## Purpose

This skill is the Web challenge controller and phase dispatcher. It enforces the solve state machine and routes to specialized skills at each phase.

## Contract

The orchestrator returns phase state, not exploit success:

```yaml
phase: recon | attack-queue | focused-probe | primitive-lock | control-plane | final-chain | retro
status: continue | pivot | blocked | dead | close
owner: ctf-web | <focused-skill>
strongest_signal: <one evidence-backed sentence>
next_action: <one bounded action>
flag_status: absent | candidate | oracle-verified
oracle_verified: false | true
```

A flag-shaped string from source, HTTP, browser, or command output is only a
candidate. Keep `oracle_verified: false` until an independent exact/file/hash
oracle accepts the value; never treat `flag_candidates`, `flag_detected`, or
`direct_solve` from a scanner as final closure.

## Load When

Load when routing identifies a Web-shaped challenge or when a live Web surface becomes the dominant evidence path.

## Do Not Load When

Do not load for a static artifact with no HTTP/client boundary, and do not let a Web leaf skill replace this phase controller.

## Required Inputs

Require the target/source inventory, current Web phase, route/input/auth map, and the latest evidence snapshot or route plan.

## First Safe Action

Run the Web analysis facade and establish a read-only recon map before selecting a focused vulnerability skill.

## Dispatch / Handoff

Dispatch only after the phase gate: recon -> attack queue -> focused probe -> primitive lock -> control plane -> final chain. Pivot to another category only with explicit evidence.

- Start reference navigation from `references/REFERENCE_INDEX.md` when multiple Web subfamilies or phases compete.
- Keep this skill thin: own phase discipline, route selection, and skill dispatch only.
- Keep `notes.md` centered on the current phase, current primitive candidate, and next smallest safe check.
- Pivot early when the dominant evidence is really pwn/rev/crypto/forensics/misc shaped.

## Post-foothold closure contract

When a Web primitive reaches a file, service, host, or internal boundary, load `../ctf-common/references/flag-candidate-oracle.md`. Use `ctf-flag-verify` to distinguish a strict candidate from an oracle-verified value, then record success with `ctf-evidence-board command=flag-verify`. A reachable `/flag`, root UID, HTTP 200, or readable deployment secret is not flag proof by itself.
## Scope
Use only for authorized CTF, lab, benchmark, or local web services. Avoid aggressive brute force and broad scanning unless the challenge explicitly requires it.

## Inputs

Collect:

- Target URL, host, port, and scope.
- Source tree, Docker files, environment assumptions, and dependency manifests.
- Framework, routes, middleware, templates, database access, file operations, outbound HTTP, auth/session logic.
- Inputs: query params, path params, form fields, JSON bodies, cookies, headers, upload fields, WebSocket messages, admin/debug endpoints.

## Solve State Machine

Track current phase in `notes.md`:

```markdown
# Web Phase
Current phase: recon | attack-queue | focused-probe | primitive-lock | control-plane | final-chain | retro
Reason:
Next required action:
```

### Phase: recon

- Run `ctf-web-analyze` first; `ctf-web-recon` remains for compatibility.
- If source is available, also load `ctf-web-source-map`.
- Perform read-only reconnaissance: map routes, inputs, auth boundaries, framework fingerprint, debug/admin/upload/editor surfaces, and bot behavior.
- Output a Recon Map with candidate attack directions.
- Transition to attack-queue when recon map exists.

Recon is incomplete until these are recorded:
- At least one route/input map entry.
- Auth/session status.
- Framework/language guess.
- Admin/debug/upload/API/bot surface status, even if absent.
- At least two candidate attack directions, unless only one surface exists.
- A first safe check for every candidate.

Do not enter focused-probe directly from recon. Always pass through attack-queue unless source code proves one critical primitive with trivial low-risk verification.

### Phase: attack-queue

- Load `ctf-web-attack-queue`.
- Score every candidate by Value, Cost, Risk, Stability, Confidence.
- Select the highest-score candidate.
- Record the attempt budget and stop condition.
- Transition to focused-probe.

### Phase: focused-probe

- Load the vulnerability-specific skill for the selected candidate.
- Use minimal probes with an explicit attempt budget.
- Do not try more than 3 variants of the same payload family unless the hypothesis changed.

Focused-probe budgets should stay in the specialized skill or the selected attack queue entry. Do not re-expand every family budget here.

After budget exhaustion, return to attack-queue. Do not continue because the path is "interesting."
- If a critical primitive or two high primitives are confirmed, transition to primitive-lock.
- If the budget is exhausted without confirmation, return to attack-queue.

## Pattern Recall Gate

Use `ctf-web-patterns` or `ctf-web-pattern-search` only after recon and attack-queue exist.

Good use cases:

- A candidate is promising but the exact bypass family is unclear.
- The target shows parser discrepancy, framework quirk, or CTF-like historical pattern.
- Source or dependency evidence suggests a known class but not the exact primitive.

Rules:

- Pattern recall cannot bypass attempt budget.
- Pattern recall cannot justify bulk fuzzing.
- Pattern recall must produce one focused safe check, not a payload storm.
- If the matched pattern requires destructive behavior, route through `ctf-web-stability-guard`.

Use references to keep this controller compact:

- early recon flow -> `references/blackbox-first-pass.md`, `references/v9-blackbox-toolchain.md`
- runtime/admin-bot -> `references/browser-runtime-admin-bot.md`
- parser/path/content-type mismatch -> `references/parser-differential.md`
- source-first bridge -> `references/source-leak-audit-bridge.md`
- attack-queue / control heuristics -> `references/decision-gates.md`, `references/practical-patterns.md`
- closure routing -> `references/web-closure-matrix.md`, `references/flag-recovery.md`

### Phase: primitive-lock

- Load `ctf-web-primitive-lock`.
- Confirm the strongest primitive with evidence.
- Stop broad probing and all unrelated payload families.
- Transition to control-plane.

### Phase: control-plane

- Load `ctf-web-control-plane`.
- Select the most stable challenge-local channel for output/exfiltration.
- If file write or overwrite is involved, load `ctf-web-file-write` for the file write matrix. Use `ctf-web-upload` only for upload validation, storage, archive extraction, and upload-to-execute behavior.
- Transition to final-chain when canary succeeds and path is reproducible.

### Phase: final-chain

- Load `ctf-web-exploit-chain`.
- Build the shortest stable chain.
- Before any destructive or high-risk action, consult `ctf-web-stability-guard`.
- Write `solve.py` or `solve.js`.
- Run `ctf-evidence-board` with `command=flag-verify`, or another independent challenge oracle; only then write `agent_flag.txt`.

### Phase: retro

- Load `ctf-web-retro`.
- Analyze what worked and what failed.
- Generate lessons learned.
- Produce skill patch proposals if needed.

## When to Pivot

- If the dominant signal is native memory corruption or direct binary exploitation, hand off to `ctf-pwn`.
- If the dominant signal is executable validation or mobile/native analysis, hand off to `ctf-rev`.
- If the dominant signal is mathematical cryptanalysis or parameter recovery, hand off to `ctf-crypto`.
- If the dominant signal is artifact extraction / stego / pcap / document handling, hand off to `ctf-forensics`.
- If the challenge is mostly protocol, puzzle, or mixed routing rather than web exploitation, hand off to `ctf-misc`.

## Skill Dispatch

### Core Flow Entries (P0)

| Phase | Primary Skill / Tool |
|---|---|
| recon | `ctf-web-analyze` / `ctf-web-recon` |
| attack-queue | `ctf-web-attack-queue` |
| primitive-lock | `ctf-web-primitive-lock` |
| control-plane | `ctf-web-control-plane` |
| stability-guard | `ctf-web-stability-guard` |
| final-chain | `ctf-web-exploit-chain` |
| retro | `ctf-web-retro` |
| source available | `ctf-web-source-map` |

### Vulnerability Skills

Route to these when focused-probe selects a specific bug class:

| Evidence | Skill |
|---|---|
| SQL query construction or DB errors | `ctf-web-sqli` |
| Template rendering of user input | `ctf-web-ssti` |
| Server-side URL fetch | `ctf-web-ssrf` |
| File path input, download, include, traversal | `ctf-web-lfi` |
| Upload validation, storage, archive extraction | `ctf-web-upload` |
| Browser execution, reflection, DOM sink, admin bot | `ctf-web-xss` |
| Object ownership, tenant boundary, numeric IDs | `ctf-web-idor` |
| JWT, session token, bearer token logic | `ctf-web-jwt` |
| Java, Spring, Servlet, JSP, Tomcat, Shiro, Struts, MyBatis | `ctf-web-java` |
| API endpoints, Swagger/OpenAPI, JSON REST | `ctf-web-api` |
| GraphQL endpoint, introspection, resolver behavior | `ctf-web-graphql` |
| XML, SVG, SOAP, SAML, Office XML parser | `ctf-web-xxe` |
| Serialized blob, base64 object, Java/PHP/Python/.NET object token | `ctf-web-deser` |
| Shell command wrapper, ping/nslookup/convert/tool parameter | `ctf-web-command-injection` |
| Login/register/reset/password/MFA flow | `ctf-web-auth` |
| Cookie/session/signature/CSRF/session fixation | `ctf-web-session` |
| Explicit server-side write or overwrite primitive | `ctf-web-file-write` |
| Order/payment/coupon/points/workflow state | `ctf-web-logic` |
| One-time token, limit, inventory, repeated action, concurrency clue | `ctf-web-race` |
| Cache headers, CDN/proxy, cache key behavior | `ctf-web-cache` |
| Request smuggling, TE.CL/CL.TE, desync, duplicate framing, proxy/backend disagreement | `ctf-web-request-smuggling` |
| Mongo/Elastic/JSON operator query behavior | `ctf-web-nosql` |
| OAuth/OIDC/SAML, redirect/state/nonce, IdP or auth-code trust boundary | `ctf-web-oauth` |
| Node.js `__proto__`, prototype chain, merge/query parser pollution | `ctf-web-prototype-pollution` |
| WebSocket, Socket.IO, SSE, rooms/channels, realtime JSON messages | `ctf-web-websocket` |
| Docker/Kubernetes/metadata, object storage, CI/deployment or cloud exposure | `ctf-web-cloud` |
| Confirmed signal needs historical CTF pattern matching, bypass family recall, parser discrepancy recall, or CVE-shaped technique lookup | `ctf-web-patterns` |
| Host/service enumeration, port discovery, or exposed service inventory | `ctf-web-host-enum` |
| Internal network, SSRF-to-internal, or service pivot | `ctf-web-internal-recon` |
| Lateral movement, trust-boundary pivot, or cross-service traversal | `ctf-web-lateral-movement` |
| Post-exploitation privilege escalation or local escalation clue | `ctf-web-privesc` |

## Tool Discipline

- Use `curl` for reproducible HTTP requests.
- Use browser automation for stateful flows, JavaScript rendering, cookie/session behavior, admin bot behavior, or DOM evidence.
- Use database tools only when the challenge exposes a local DB, source config, or explicit credentials.
- Use `nmap` only for localhost or explicitly authorized challenge hosts.
- Record meaningful request/response summaries in `notes.md`, not every byte of HTML.
- Keep this skill focused on selecting the next smallest useful tool or Web-specific skill, not on reproducing every family playbook inline.

## Browser MCP Discipline

Use browser MCP only when curl, source review, or local scripts are insufficient.

Good use cases:

- JavaScript-rendered routes or SPA behavior.
- DOM XSS and client-side sinks.
- CSRF, CORS, CSP, and cookie behavior requiring real browser state.
- Login/admin UI workflows.
- Network capture for frontend API discovery.
- Console errors and interactive element discovery.
- Screenshot evidence.

Prefer `mcp-chrome` when the task needs the user's currently open CTF browser state, real tabs, real cookies, network observation, console output, or manual-login context.

Prefer Puppeteer or a clean browser profile when the task needs reproducibility, clean state, final-solve automation, or no accidental personal login state.

Do not use browser MCP for:

- Broad fuzzing.
- Repeated payload attempts.
- High-risk state-changing actions.
- File overwrite or upload loops.
- Bot compatibility testing when the challenge bot is PhantomJS or a different runtime.
- Final solve when curl or `solve.py` can reproduce the chain.

Use a dedicated CTF Chrome profile. Do not use a personal daily Chrome profile.

## Evidence Requirements

Web findings require:

- A request that triggers the behavior.
- A response or browser observation proving the behavior.
- Source-code path when source exists.
- A minimal reproduction before exploitation.
- False-positive exclusion where applicable.

## Output Contract

`notes.md` should contain:

- Recon Map, Attack Queue, Primitive Ledger, Stable Control Plane, Stability Guard, Final Chain Plan.
- Route/input map.
- Bug-class hypotheses.
- Probes and responses.
- Confirmed exploit chain.
- Final solver command.

The solver must produce or retrieve the verified flag without manual browser steps when practical.

## Stop Conditions

Ask or stop when the target is outside authorized scope, requires real third-party interaction, needs credentials not provided, or repeated probes are causing no new observations.

## Post-Foothold Closure Gate

When a server-side primitive is confirmed, do not jump directly to recursive flag search. Dispatch in this order:

1. `ctf-web-host-enum` for identity, platform, process, service, namespace, mount, and application-root facts.
2. `ctf-web-internal-recon` for one named internal asset or service; keep reachability, protocol, authentication, authorization, and closure separate.
3. `ctf-web-cloud` when the boundary is Docker/Kubernetes/metadata/object-storage/CI/deployment.
4. `ctf-web-privesc` for one evidenced local permission or execution boundary.
5. `ctf-web-lateral-movement` for one validated credential/token and named second service.
6. `ctf-web-exploit-chain` only after the control path is reproducible; then run `ctf-evidence-board command=flag-verify`.

Load these references on demand:

- minimal application secret collection -> `references/foothold-secrets-minimization.md`
- internal protocol/authz distinction -> `references/internal-protocol-validation-matrix.md`
- IIS/AppPool/Windows token boundary -> `references/windows-iis-token-boundary.md`
- Docker/Kubernetes/cloud boundary -> `references/container-k8s-cloud-boundary.md`

A flag-shaped value remains `candidate` until the independent oracle accepts the exact value. Never infer closure from a scanner's `flag_detected`, a readable file, a root-in-container identity, or a successful network handshake.
