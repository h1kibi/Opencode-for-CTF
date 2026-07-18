---
description: Start a structured Web CTF solve
agent: ctf-web
---

Use `ctf-common`, `ctf-terminal`, and `ctf-web` skills.

Open `skills/ctf-web/references/REFERENCE_INDEX.md` first when multiple Web phases or bug families compete.

Start every Web challenge by entering the solve state machine: recon → attack-queue → focused-probe → primitive-lock → control-plane → final-chain → retro.

### Phase dispatch:

- recon: `ctf-web-recon` + `ctf-web-source-map` (if source available).
- attack-queue: `ctf-web-attack-queue`.
- focused-probe: vulnerability-specific skill (see below).
- primitive-lock: `ctf-web-primitive-lock`.
- control-plane: `ctf-web-control-plane`.
- final-chain: `ctf-web-exploit-chain` + `ctf-web-stability-guard`.
- retro: `ctf-web-retro`.

### Vulnerability skills:

- SQL query construction or database errors: `ctf-web-sqli`.
- Template rendering of user input: `ctf-web-ssti`.
- Server-side URL fetch: `ctf-web-ssrf`.
- File path, download, include, traversal: `ctf-web-lfi`.
- Upload validation, storage, archive extraction: `ctf-web-upload`.
- Browser execution, reflection, DOM sink, admin bot: `ctf-web-xss`.
- Object ownership, tenant boundary, predictable IDs: `ctf-web-idor`.
- JWT, session token, bearer token logic: `ctf-web-jwt`.
- Java, Spring, Servlet, JSP, Tomcat, Shiro, Struts, MyBatis: `ctf-web-java`.
- API endpoints, Swagger/OpenAPI, JSON REST: `ctf-web-api`.
- GraphQL endpoint, introspection, resolver behavior: `ctf-web-graphql`.
- XML, SVG, SOAP, SAML, Office XML parser: `ctf-web-xxe`.
- Serialized blob, base64 object, object token: `ctf-web-deser`.
- Shell command wrapper, ping/nslookup/convert/tool parameter: `ctf-web-command-injection`.
- Login/register/reset/password/MFA flow: `ctf-web-auth`.
- Cookie/session/signature/CSRF/session fixation: `ctf-web-session`.
- Explicit server-side write or overwrite primitive: `ctf-web-file-write`.
- Order/payment/coupon/points/workflow state: `ctf-web-logic`.
- One-time token, limit, inventory, concurrency clue: `ctf-web-race`.
- Cache headers, CDN/proxy, cache key behavior: `ctf-web-cache`.
- Mongo/Elastic/JSON operator query behavior: `ctf-web-nosql`.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF, lab, benchmark, or local targets.
- Create or update `notes.md`.
- Start in recon phase, not exploit phase. Do not deeply exploit the first visible vulnerability.
- Before deeply exploiting any one bug class, build an attack surface table and candidate attack queue.
- Rank candidate paths by value, verification cost, risk, stability, and confidence.
- Try high-value, low-cost, low-risk candidates before long or fragile chains.
- Do not select a path only because it was discovered first.
- Use focused probes with an explicit attempt budget.
- Treat wordlist fuzzing, repeated bot triggers, repeated uploads, file overwrites, SQL dump automation, and high-concurrency loops as high-risk actions.
- Before high-risk actions, write a High-Risk Action Plan and prefer a safer verification step.
- Maintain a Primitive Ledger after the first non-trivial finding.
- If one critical primitive or two high primitives are confirmed, stop broad probing and switch to Primitive Lock mode.
- Before final exploitation, choose a stable control plane.
- Prefer admin session, backend endpoint, DB-backed field, reloadable/imported file, or debug/log view over blind callback.
- Before any state-changing write/overwrite/restart action, perform a low-risk canary and record the stability guard.
- Do not try more than 3 variants of the same payload family unless the hypothesis changed.
- Write `solve.py` or `solve.js` when practical.
- Write only the verified final flag to `agent_flag.txt`.
- Pivot early to `ctf-pwn`, `ctf-rev`, `ctf-crypto`, `ctf-forensics`, or `ctf-misc` once dominant evidence leaves the Web family.
- Custom Python/Node/Bash/browser scripts are high-risk if they send more than 20 requests, use concurrency, repeatedly trigger bots, repeatedly upload files, dump data, mutate backend state, or write/overwrite files.
- Use browser MCP only after recon identifies a browser-specific need: SPA route discovery, DOM sink evidence, login/admin UI, network capture, console error, or screenshot evidence.
- Prefer curl/source review for reproducible HTTP behavior.
- Prefer `solve.py` or `solve.js` for final solve; browser MCP should not be required for final flag retrieval unless the challenge itself is browser-only.
- Treat Chrome MCP click/fill/inject/network-debugger/custom-request actions as high-risk when they mutate state, trigger bots, upload files, or repeat payloads.
- Never use personal Chrome history/bookmarks for CTF solving.
