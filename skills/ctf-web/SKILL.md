---
name: ctf-web
description: Use for authorized Web CTF challenges involving HTTP services, source review, routing, authentication, cookies, sessions, APIs, templates, upload handling, SSRF, SQL injection, XSS, SSTI, LFI, IDOR, JWT, deserialization, or browser interaction.
compatibility: opencode
---

# CTF Web

Core rule: The Web agent must optimize for primitive convergence, stable control plane selection, and instance stability. Once a critical primitive or two high primitives are confirmed, stop broad probing and build the shortest stable chain.

## Purpose

Use this skill as the Web challenge controller. It maps the attack surface, separates source review from black-box probing, and routes specific evidence to specialized web skills.

The structure is influenced by AWE's vulnerability-specific pipelines: reconnaissance, input discovery, context analysis, minimal probe, verification, fallback, and report.

## Scope

Use only for authorized CTF, lab, benchmark, or local web services. Avoid aggressive brute force and broad scanning unless the challenge explicitly requires it.

## Inputs

Collect:

- Target URL, host, port, and scope.
- Source tree, Docker files, environment assumptions, and dependency manifests.
- Framework, routes, middleware, templates, database access, file operations, outbound HTTP, auth/session logic.
- Inputs: query params, path params, form fields, JSON bodies, cookies, headers, upload fields, WebSocket messages, admin/debug endpoints.

## Workflow

### Recon First Gate

Before exploiting a specific bug class, perform a short whole-target reconnaissance pass.

The Web agent must not deeply exploit the first visible vulnerability until it has built:

1. A route/input map.
2. An auth/session map.
3. A source/sink map when source exists.
4. A candidate attack queue.
5. A cost/risk/value ranking.

Allowed during recon:

- Read source files.
- Fetch homepage and linked same-origin pages.
- Inspect forms, routes, cookies, headers, robots.txt, sitemap.xml.
- Send harmless baseline requests.
- Trigger non-mutating GET requests.
- Use one minimal harmless probe only when needed to classify an input.

Not allowed during recon:

- Broad fuzzing.
- Wordlist scanning.
- High-concurrency requests.
- Brute force.
- Destructive upload/write/overwrite.
- Repeated payload variants.
- SQL dump attempts.
- Blind callback chains.
- Admin-bot payload spam.
- State-changing actions without a canary plan.

Recon completion requirement:

Do not enter deep exploitation until this table exists in `notes.md`:

| Surface | Evidence | Inputs | Auth Needed | Source/Sink | Candidate Bug | Value | Cost | Risk | Stability | Next Safe Check |
|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|

Exception:

If source review reveals a critical primitive with a trivial low-risk verification, the agent may verify it once, then must return to the attack queue before continuing.

### Attack Queue Ranking

After recon, build an attack queue before exploitation.

Score each candidate path:

| Candidate | Evidence | Expected Primitive | Value | Cost | Risk | Stability | Confidence | Score | Decision |
|---|---|---|---:|---:|---:|---:|---:|---:|---|

Scoring:

- Value:
  - 5 = likely RCE, arbitrary file read/write, admin session, direct flag access
  - 4 = strong auth bypass, SSRF to internal admin/debug, SQL data read/write
  - 3 = stored XSS with bot, upload control, template injection, IDOR with sensitive data
  - 2 = reflected XSS, weak info leak, minor session issue
  - 1 = cosmetic or uncertain behavior

- Cost:
  - 1 = one request or obvious source proof
  - 2 = small script or 2-3 requests
  - 3 = needs auth flow, browser, or multi-step setup
  - 4 = needs many payloads, timing, race, or environment tuning
  - 5 = brute force, broad scan, fragile browser/bot chain

- Risk:
  - 1 = read-only
  - 2 = harmless canary or reversible state change
  - 3 = writes user-controlled content
  - 4 = overwrites files, triggers bot repeatedly, or mutates backend state
  - 5 = may crash, deadlock, corrupt, restart, or lock out the instance

- Stability:
  - 5 = deterministic local/source-backed path
  - 4 = stable backend/admin/database surface
  - 3 = browser/bot but reproducible
  - 2 = timing/blind behavior
  - 1 = flaky or environment-sensitive

Score formula:

`Score = Value + Confidence + Stability - Cost - Risk`

Decision rule:

- Try the highest-score low-risk candidate first.
- Prefer short, high-value, source-backed checks.
- Delay expensive or destructive candidates until safer high-value paths are exhausted.
- Do not choose a lower-score candidate just because it was discovered first.

### Web Exploitation Phase Gates

Do not keep probing payload variants after strong primitives are confirmed. Web solving must move through these gates:

1. Surface Map
   - Map routes, inputs, auth boundaries, source files, debug endpoints, admin pages, upload/editor endpoints, and bot behavior.

2. Primitive Ledger
   - Build and update a primitive ledger before deep exploitation.
   - Confirm primitives with evidence.
   - Score primitives by exploitation strength.

3. Primitive Lock
   - Once one critical primitive or two high primitives are confirmed, stop broad probing.
   - Switch from discovery to exploit-chain construction.
   - Do not continue random payload families unless they directly improve the locked chain.

4. Control Plane Selection
   - Pick the most stable challenge-local control plane.
   - Prefer authenticated/admin surfaces, backend APIs, database-backed fields, reloadable source files, debug/log views, and existing rendered pages over blind callbacks.

5. Stability Guard
   - Before state-changing or destructive actions, perform a low-risk canary test.
   - Avoid actions likely to crash, deadlock, corrupt, or permanently destabilize the challenge instance.
   - Keep final exploitation short, scripted, and reproducible.

6. Final Chain
   - Build `solve.py` or `solve.js`.
   - The solver should reproduce the chain from a clean challenge state when practical.

### Standard Workflow

1. Confirm target and record scope in `notes.md`.
2. Read source if available before probing blindly.
3. Map routes and inputs into an attack surface table.
4. Identify trust boundaries: auth, roles, object ownership, file paths, server-side fetch, template rendering, SQL, serialization, and uploads.
5. Establish baseline requests and responses.
6. Use harmless probes first, then vulnerability-specific minimal probes.
7. Route to a specialized skill when evidence is present:
   - SQL query construction or DB errors: `ctf-web-sqli`.
   - Template rendering of user input: `ctf-web-ssti`.
   - Server-side URL fetch: `ctf-web-ssrf`.
   - File path input, download, include, traversal: `ctf-web-lfi`.
   - Upload validation, storage, archive extraction: `ctf-web-upload`.
   - Browser execution, reflection, DOM sink, admin bot: `ctf-web-xss`.
   - Object ownership, tenant boundary, numeric IDs: `ctf-web-idor`.
   - JWT, session token, bearer token logic: `ctf-web-jwt`.
8. Write a deterministic `solve.py` or `solve.js` with target URL as an argument or variable.

## Primitive Ledger

Maintain this table in `notes.md` for every Web challenge once any non-trivial behavior is found:

| Primitive | Evidence | Strength | Best Use | Confirmed |
|---|---|---:|---|---|
| stored XSS | request/response/source/bot visit | high | admin session, admin-side action | yes/no |
| reflected/DOM XSS | browser evidence/source sink | medium | token/action under victim context | yes/no |
| admin bot | bot visit/user-agent/timing | high | privileged browser execution | yes/no |
| admin session/cookie access | cookie/backend page evidence | critical | stable authenticated control plane | yes/no |
| debug page/source leak | stack trace/debug page/source path | high | path discovery, config leak, session leak | yes/no |
| arbitrary file write | endpoint/source/effect | critical | code execution, template/static overwrite | yes/no |
| overwrite-only file write | failed create + successful overwrite | high | replace existing reloadable/imported file | yes/no |
| arbitrary/local file read | response/source/effect | critical/high | flag/config/source read | yes/no |
| SSRF | server-side request effect | high/medium | internal admin/debug access | yes/no |
| template/expression eval | rendered calculation/error/source | critical/high | code execution or file read | yes/no |
| SQL injection | DB error/timing/boolean/source | high | auth bypass, data read/write | yes/no |
| upload-to-execute | file URL/handler/source evidence | critical | code execution | yes/no |

Strength rules:

- critical: directly gives code execution, arbitrary server file write, admin session, or arbitrary file read.
- Treat file read as critical when it can read arbitrary absolute paths, flag locations, secrets, source, or config.
- high: gives privileged context, durable stored execution, debug/source leak, SSRF to internal control surface, or database control.
- Treat file read as high when it is constrained to a narrow non-sensitive directory.
- medium: useful but requires another primitive.
- low: only informational or unreliable.

## Web Solve State Machine

Track current phase in `notes.md`:

```markdown
# Web Phase
Current phase: recon | attack-queue | focused-probe | primitive-lock | control-plane | final-chain
Reason:
Next required action:
```

Transitions:

- recon -> attack-queue: route/input/auth/source map exists, and candidate attack queue exists.
- attack-queue -> focused-probe: highest-score candidate selected, and probe budget and risk are recorded.
- focused-probe -> primitive-lock: one critical primitive confirmed, or two high primitives confirmed.
- focused-probe -> attack-queue: attempt budget exhausted, no stronger primitive confirmed, probe risk increases, or target stability worsens.
- primitive-lock -> control-plane: a stable admin/backend/database/file/debug surface is identified.
- control-plane -> final-chain: output channel is selected, canary succeeds, and exploit path is reproducible.

Rules:

- In recon phase, do not deeply exploit a bug class.
- In attack-queue phase, choose by value/cost/risk/stability, not discovery order.
- In focused-probe phase, obey the attempt budget.
- In primitive-lock phase, do not run broad route fuzzing or unrelated payload families.
- In control-plane phase, do not search for new bug classes unless the selected control plane fails.
- In final-chain phase, only perform actions required to reproduce and verify the chain.

Primitive lock rule:

- If any critical primitive is confirmed, stop broad probing and build a chain around it.
- If two high primitives are confirmed, stop broad probing and combine them.
- If stored XSS + admin bot are confirmed, immediately attempt admin-session/control-plane acquisition.
- If file write is confirmed, immediately build a write matrix instead of guessing paths.
- If admin session is confirmed, prioritize backend control surfaces over blind exfiltration or speculative payloads.

Stop wasting rule:

- Do not try more than 3 variants of the same payload family unless the hypothesis changed.
- Do not continue blind callback variants after a stable authenticated/admin control plane is available.
- Do not keep fuzzing routes after source or debug output gives a better map.

## Stable Control Plane Priority

When any strong primitive is confirmed, select a stable control plane before final exploitation.

Prefer control planes in this order:

1. Authenticated admin session or privileged cookie.
2. Existing backend/admin endpoint.
3. Existing database-backed field visible in admin/user pages.
4. Existing file that is imported, loaded, rendered, or served reliably.
5. Existing logs or debug/admin views.
6. Existing template/static route.
7. New route or newly created file only if reload/serving behavior is proven.
8. Blind callback only when no stable challenge-local channel exists.

Decision rules:

- If admin session is available, use it before blind XSS, blind SSRF, or speculative file writes.
- If code execution or file write is available, choose the output channel first.
- Prefer writing output into an existing rendered database field over creating a new HTTP route.
- Prefer challenge-local observation over external exfiltration.
- Prefer existing reloadable/imported files over core routing/config files.
- Do not overwrite core files until a canary proves write behavior and a final chain is ready.

## Stability Guard

Before any action that changes server state, classify the risk:

| Action | Risk | Required Guard |
|---|---:|---|
| read-only request | low | record result |
| harmless form submission | low/medium | use unique marker |
| session reuse | medium | preserve original cookie |
| upload/write canary | medium | write reversible marker only |
| overwrite existing non-core file | medium/high | prove reload/import path first |
| overwrite route/config/settings file | high | final step only |
| sync browser request to localhost/dev server | high | avoid unless proven safe |
| mass fuzzing or high concurrency | high | avoid by default |
| service restart/container mutation | high | ask or defer |

Rules:

- Use short, single-shot probes.
- Avoid high concurrency unless the bug class is race-condition specific.
- Avoid synchronous XHR against single-threaded development servers.
- Avoid payloads that can hang the bot or the local service.
- Use timeouts for all scripted HTTP requests.
- Use unique markers for canary writes.
- Prefer reversible writes.
- Do not overwrite app core files until the final exploit path is locked.
- If an action may crash the instance, first write down why it is necessary, what evidence supports it, how to recover or restart, and what lower-risk probe was tried first.

## Attempt Budget

Each candidate path has a strict initial budget.

Default budget:

| Candidate Type | Initial Budget |
|---|---:|
| source-backed obvious sink | 3 focused checks |
| auth/session issue | 3 focused checks |
| upload/file write | 2 canary checks before matrix |
| XSS without bot | 2 payloads |
| XSS with bot | 2 ES5 payloads before reassessing runtime |
| SQLi without source evidence | 3 minimal probes |
| SSRF without internal target map | 2 probes |
| brute force / wordlist / broad fuzzing | disabled by default |

After the budget is used:

1. Update the attack queue.
2. Record why the path did or did not produce a stronger primitive.
3. Either lock the primitive, downgrade the candidate, or switch to the next candidate.

Do not continue a path just because it is partially interesting.
Continue only if the next check has a clear expected information gain.

## Batch and Destructive Testing Gate

Treat these as high-risk actions:

- More than 20 HTTP requests in one script.
- Any concurrency greater than 1.
- Wordlist fuzzing.
- Directory brute force.
- SQL dump automation.
- Repeated admin-bot triggers.
- Repeated uploads.
- File overwrite attempts.
- Service restart.
- Container mutation.
- Large payloads.
- Race-condition loops.
- Long-running timing probes.

Before any high-risk action, write this plan in `notes.md`:

```markdown
# High-Risk Action Plan

Action:
Why needed:
Expected information gain:
Why safer options are insufficient:
Request count:
Concurrency:
Timeout:
State changes:
Rollback/recovery:
Stop condition:
```

Default limits:

- Concurrency: 1.
- Timeout per request: 3-5 seconds.
- Maximum initial batch: 20 requests.
- Maximum upload/write canaries: 2 before reassessment.
- Maximum bot-triggering payloads: 2 before reassessment.
- No destructive batch tests unless the final chain is locked.

If the target becomes slow, inconsistent, or returns repeated 5xx errors, stop probing and reassess instance stability.

## Tool Discipline

- Use `curl` for reproducible HTTP requests.
- Use browser automation for stateful flows, JavaScript rendering, cookie/session behavior, admin bot behavior, or DOM evidence.
- Use database tools only when the challenge exposes a local DB, source config, or explicit credentials.
- Use `nmap` only for localhost or explicitly authorized challenge hosts.
- Record meaningful request/response summaries in `notes.md`, not every byte of HTML.

## Evidence Requirements

Web findings require:

- A request that triggers the behavior.
- A response or browser observation proving the behavior.
- Source-code path when source exists.
- A minimal reproduction before exploitation.
- False-positive exclusion where applicable.

## Output Contract

`notes.md` should contain:

- Route/input map.
- Bug-class hypotheses.
- Probes and responses.
- Confirmed exploit chain.
- Final solver command.

For Web challenges, maintain these sections:

```markdown
# Recon Map

| Surface | Evidence | Inputs | Auth Needed | Source/Sink | Candidate Bug |
|---|---|---|---|---|---|

# Attack Queue

| Candidate | Evidence | Expected Primitive | Value | Cost | Risk | Stability | Confidence | Score | Decision |
|---|---|---|---:|---:|---:|---:|---:|---:|---|

Selected candidate:
-

Why this before others:
-

Attempt budget:
-

Stop condition:
-

# Web Phase
Current phase: recon | attack-queue | focused-probe | primitive-lock | control-plane | final-chain
Reason:
Next required action:

# High-Risk Action Plan

Action:
Why needed:
Expected information gain:
Why safer options are insufficient:
Request count:
Concurrency:
Timeout:
State changes:
Rollback/recovery:
Stop condition:

# Primitive Ledger

| Primitive | Evidence | Strength | Best Use | Confirmed |
|---|---|---:|---|---|

# Strongest Primitive Lock

- Current strongest primitive:
- Evidence:
- Why this is stronger than alternatives:
- What branches should be stopped:

# Stable Control Plane

| Candidate | Evidence | Stability | Risk | Use |
|---|---|---:|---:|---|
| admin session | | | | |
| backend endpoint | | | | |
| DB-backed field | | | | |
| reloadable/imported file | | | | |
| log/debug view | | | | |
| direct HTTP echo | | | | |
| blind callback | | | | |

Selected control plane:
-

# Stability Guard

- State-changing action planned:
- Canary test:
- Rollback/recovery:
- Why lower-risk options are insufficient:

# Final Chain Plan

1.
2.
3.
4.
5.
```

The solver must produce or retrieve the verified flag without manual browser steps when practical.

## Stop Conditions

Ask or stop when the target is outside authorized scope, requires real third-party interaction, needs credentials not provided, or repeated probes are causing no new observations.
