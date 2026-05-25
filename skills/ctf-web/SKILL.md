---
name: ctf-web
description: Use for authorized Web CTF challenges involving HTTP services, source review, routing, authentication, cookies, sessions, APIs, templates, upload handling, SSRF, SQL injection, XSS, SSTI, LFI, IDOR, JWT, deserialization, or browser interaction.
compatibility: opencode
---

# CTF Web Orchestrator

Core rule: Start every Web challenge in recon phase. Map the full attack surface before exploiting any one bug class. Progress through the solve state machine: recon → attack-queue → focused-probe → primitive-lock → control-plane → final-chain → retro.

## Purpose

This skill is the Web challenge controller and phase dispatcher. It enforces the solve state machine and routes to specialized skills at each phase.

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

- Load `ctf-web-recon`.
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

Focused-probe budget:
- SQLi without source evidence: 3 minimal probes.
- XSS without bot: 2 payloads.
- XSS with bot: 2 ES5/XHR payloads before reassessing runtime.
- SSRF without internal target map: 2 probes.
- Upload/write: 2 canary checks before matrix.
- File overwrite: 1 reversible canary before reassessment.
- Race/concurrency: disabled unless attack-queue selects race as the top candidate.
- Wordlist fuzzing and sqlmap are never initial focused probes.

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
- Verify the flag and write `agent_flag.txt`.

### Phase: retro

- Load `ctf-web-retro`.
- Analyze what worked and what failed.
- Generate lessons learned.
- Produce skill patch proposals if needed.

## Skill Dispatch

### Core Flow Skills (P0)

| Phase | Primary Skill |
|---|---|
| recon | `ctf-web-recon` |
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
| Mongo/Elastic/JSON operator query behavior | `ctf-web-nosql` |
| Confirmed signal needs historical CTF pattern matching, bypass family recall, parser discrepancy recall, or CVE-shaped technique lookup | `ctf-web-patterns` |

## Tool Discipline

- Use `curl` for reproducible HTTP requests.
- Use browser automation for stateful flows, JavaScript rendering, cookie/session behavior, admin bot behavior, or DOM evidence.
- Use database tools only when the challenge exposes a local DB, source config, or explicit credentials.
- Use `nmap` only for localhost or explicitly authorized challenge hosts.
- Record meaningful request/response summaries in `notes.md`, not every byte of HTML.

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
