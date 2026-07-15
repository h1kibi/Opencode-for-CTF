---
description: CTF domain: Start a Java Web CTF solve with source/JAR/WAR/config/bytecode workflow
agent: ctf-web
subtask: true
---

Use `ctf-common`, `ctf-decision-engine`, `ctf-terminal`, `ctf-web`, `ctf-web-java`, `ctf-whitebox-audit`, Java `ctf-java-*` tools, local Java Web pattern cards, and lessons.

Challenge/target:
$ARGUMENTS

### Java Web routing gate

Enter Java Web mode when any signal appears: `.jar`, `.war`, `.class`, `pom.xml`, `build.gradle`, `web.xml`, `BOOT-INF`, `WEB-INF`, `src/main/java`, `application.properties`, `application.yml`, `JSESSIONID`, Tomcat/Jetty/Undertow, Spring/Spring Boot, Shiro `rememberMe`, JSP, `.do`, `.action`, Struts, MyBatis, Hibernate, Thymeleaf, Freemarker, H2, Druid, Swagger/OpenAPI, or Actuator.

Choose exactly one opening lane before payload thinking:

| Lane | Evidence | First tools | Output required |
|---|---|---|---|
| `source-first` | source tree/config/build files | `ctf-java-config-map`, `ctf-java-map`, `ctf-java-source-slice`, `ctf-java-dep-risk` | route-input-auth-sink-dependency map |
| `artifact-first` | JAR/WAR/ZIP/class files | `ctf-java-archive-map` -> `ctf-safe-extract` -> config/map/bytecode/decompile selected classes | app-class map before gadgets |
| `blackbox-first` | URL only | `ctf-web-fingerprint`, `ctf-web-blackbox-map`, then focused Java paths | Java fingerprint/control-plane/auth model |

Do not mix lanes until the first Java Web evidence map exists.

### Java artifact decompile gate

For JAR/WAR/class challenges, prefer the lowest-cost evidence path that can close the exploit chain. Do **not** default to full JADX/full decompilation just because a jar exists.

Classify the artifact before decompilation:

| Profile | Signals | Default strategy |
|---|---|---|
| `thin-jar` | Spring Boot fat jar or WAR with few app classes, clear `BOOT-INF/classes`/`WEB-INF/classes`, small controller/config/security surface, obvious sinks | archive/config/bytecode/javap first; no full decompile by default |
| `mid-jar` | moderate app class count, several controllers/services/security helpers, some unclear control flow | selective decompile only unresolved app classes |
| `heavy-jar` | many app classes, obfuscation, deep service graph, complex AOP/proxy/framework magic, unclear route/sink map | full decompile is allowed after archive/config/bytecode map |

`thin-jar` mandatory opening order:

1. `ctf-java-archive-map` to identify layout, app classes, configs, templates, and dependencies.
2. `ctf-safe-extract` only after archive listing/path-safety is known.
3. `ctf-java-config-map` for context path, auth/security, profiles, secrets, actuator/H2/Druid/template/upload hints.
4. `ctf-java-bytecode-hints` for route annotations, constants, filters/realms/interceptors, sources, sinks, blacklists, and classpath clues.
5. Targeted `javap -c -p -v` / `ctf-java-jdk-env action=javap` on only high-value app classes: controllers, config, realm/filter/interceptor, parser/deserializer/template/file helpers.
6. `ctf-java-chain-planner` from compact evidence; then close route -> auth -> controlled input -> sink -> oracle before gadget depth.

Escalate to `ctf-java-decompile-targets` / JADX only with an explicit unresolved fact:

- auth/filter-chain semantics cannot be confirmed from config/bytecode/javap;
- sink reachability or data shape is unclear;
- blacklist/whitelist/normalization logic is too complex in bytecode;
- lambda/inner/anonymous/switch-heavy control flow blocks closure;
- custom `readObject`/`writeObject`, parser, template, file, URL, or security helper needs source-like reconstruction.

Before any decompile step, state: `unresolved fact`, `why javap/bytecode is insufficient`, `classes to decompile`, and `expected evidence`. If these cannot be stated, do not decompile.

Full decompilation is a last resort for app code, not a starting point. Never full-decompile third-party libraries before app route/sink evidence.

### Java Web fast lane

- Live URL only: run Java-aware fingerprint/blackbox first and look for `JSESSIONID`, Tomcat/Jetty/Undertow, Spring Whitelabel/error shapes, actuator, H2, Druid, Swagger/OpenAPI, JSP, `.do`, `.action`, Shiro `rememberMe`.
- Source tree present: run `ctf-java-config-map`, `ctf-java-map`, `ctf-java-source-slice`, `ctf-java-dep-risk`, then feed the compact evidence/Attack Queue Seed into `ctf-java-chain-planner` before manual review.
- JAR/WAR/ZIP artifact present: run `ctf-java-archive-map` before extraction, then `ctf-safe-extract`; classify as `thin-jar`/`mid-jar`/`heavy-jar`. For `thin-jar`, continue with config map, bytecode hints, and targeted `javap` on high-value app classes before any decompile. Use selected `ctf-java-decompile-targets` only when a named unresolved fact blocks route/auth/sink/constraint closure. Full JADX/full decompilation is allowed only for `heavy-jar` or after shorter archive/config/bytecode/javap routes fail.
- Source/JAR/WAR/config artifacts: apply the `ctf-whitebox-audit` loop. Build a Java handoff: route/controller, filter/interceptor/security chain, request DTO/body shape, service/mapper flow, config/dependency gate, source, sink, sanitizer, oracle, and next one-variable probe.
- Use `ctf-whitebox-handoff` and `ctf-local-harness-verifier operation=plan|write|evaluate` for method/class harness plans when the app will not boot.
- Read tool `Attack Queue Seed` before raw findings.
- Feed compact map/config/dep/source-slice evidence into `ctf-java-chain-planner` to rank top Java chains before choosing payload families.
- Build the Java Constraint Equation before any non-trivial payload.

### Java Constraint Equation

| Route / Entry | Framework Binding | Auth / Filter / Interceptor | Controlled Fields | Transform / Validator | Sink | Primitive / Oracle | Plausible Flag Path |
|---|---|---|---|---|---|---|---|

Dependency gate:

| Dependency | Version | Config Gate | Reachable Code Path | Controlled Data Shape | Gadget / Feature | First Safe Check | Do-not-try-until |
|---|---|---|---|---|---|---|---|

Evidence gate:

| Finding | Class/Method/Line Verified | Route Reachable | Controlled Data Shape | Sink / Guard Condition | Oracle / Harness | Verdict |
|---|---|---|---|---|---|---|

### Attack queue order

1. Direct config/debug/control plane: actuator, H2, Swagger/OpenAPI, Druid, stack trace, config leak, default/admin creds.
2. Source-proven simple sinks: MyBatis `${}`, file read/write, upload path/JSP write, template expression, XXE/SSRF.
3. Auth/filter route confusion: Spring Security, Shiro chain, servlet/filter/interceptor/session role mismatch, mass assignment.
4. Dependency-driven bugs: only after version + config gate + reachable sink/parser + controlled data shape + oracle.
5. Long gadget chains, broad fuzzing, or full decompilation only after shorter source/config/auth/archive/bytecode/javap routes fail.

### Framework and bug-family matrices

#### Spring / Spring Boot

Prioritize: `/actuator`, `/actuator/env`, `/actuator/mappings`, `/actuator/heapdump`, `/actuator/logfile`, `/h2-console`, `/swagger-ui`, `/v3/api-docs`, Whitelabel stack traces, `application-*` profile clues, `SecurityFilterChain`, DTO binding, `@ModelAttribute`, template/view names, file/static resource handlers.

Actionable only after route/auth/config evidence. Mass assignment and route matcher confusion often outrank CVE-shaped branches.

#### Shiro

Required gates before `rememberMe` gadget depth: Shiro present, version/config, `rememberMe` behavior or `deleteMe` oracle, cipher key source/default/hardcoded, gadget classpath, route/session boundary, and parse oracle. Also check Shiro filter-chain logic, `anon/authc/user/roles/perms` order, `@RequiresRoles`, and role/session mismatch.

#### Struts2

Required gates before OGNL/CVE depth: `.action`/Struts confirmed, version or affected interceptor/parser, controlled parameter/header/content-type, route reachability, and body/error oracle. Check devMode, file upload parser, and parameter binding before historical chains.

#### MyBatis / Hibernate / H2 / SQL

Prioritize mapper XML and annotations: `${}` vs `#{}`, `@Select/@Update/@Insert/@Delete`, `createQuery`, `createNativeQuery`, `JdbcTemplate`, `Statement`, HQL/JPQL parser mismatch, H2 datasource/console/`INIT`. Prove mapper reachability and one harmless SQL/HQL differential before sqlmap or stacked payload depth.

#### Template / Expression

Identify engine and context before markers: Thymeleaf template-name/fragment/preprocessing, Spring SpEL, Freemarker, Velocity, JSP EL, OGNL. Use harmless engine-specific eval/error markers first; prefer file-read closure over `Runtime.exec` when shell is unnecessary or blocked.

#### File / Upload / JSP write

Map base directory, normalization, extension/content-type checks, storage name, overwrite/create behavior, served/reload behavior, and readback oracle. Use `ctf-file-write-matrix` for write primitives. Canary before final writes; never overwrite existing files blindly.

#### Deserialization / Parser

Native serialization, XMLDecoder, XStream, Jackson default typing, Fastjson autoType, Hessian, Kryo, SnakeYAML, Shiro, Log4j/JNDI are actionable only with parser/config/data-shape/classpath/oracle evidence. `rO0AB`, `aced0005`, JSON `@type`, XML object tags, cookie parser errors, and changed exception classes are parser oracles, not automatic exploits.

#### XXE / SSRF

Identify parser/fetcher and disabled-feature state: `DocumentBuilderFactory`, `SAXParserFactory`, `XMLInputFactory`, `SAXReader`, `TransformerFactory`, `RestTemplate`, `WebClient`, `HttpClient`, `URL.openConnection`. Test one safe scheme/host/entity differential and map validator/proxy/internal target before escalation. For blind SSRF or XXE external entity checks that require OOB/DNS, default to public Interactsh for canaries and authorized CTF target data exfiltration; ask the user first for custom callback domains, high-volume transfer, or non-DNS protocol infrastructure.

#### Auth / Logic / Filter chain

Map Spring Security matchers, Shiro filter chain, Servlet filters, interceptors, `excludePathPatterns`, session role fields, method security, admin preview endpoints, mass assignment, JWT/session fixation, and path normalization (`;`, `//`, encoded slash, matrix vars). Use `ctf-web-authz-matrix`, `ctf-web-state-machine-map`, and `ctf-web-diff-probe` when evidence points to auth/workflow confusion.

### Public infrastructure and OOB policy

- For DNS/OOB confirmation and authorized CTF target data exfiltration, default to public Interactsh when available. Use it to prove reachability/parser/fetcher/logging behavior and to exfiltrate CTF target flags, secrets, credentials, session data, environment values, file contents, or small result data when needed for closure.
- If a Java Web branch needs a public VPS, reverse shell listener, public HTTP callback, LDAP/RMI/JNDI server, custom DNS/OOB domain, private collaborator endpoint, high-volume transfer, or externally reachable infrastructure beyond Interactsh DNS/OOB, ask the user for the endpoint/resource first.
- Do not assume a public server exists, do not expose local tunnels, do not start public listeners, and do not choose non-Interactsh third-party OOB services without explicit user approval.
- If the user has no public infrastructure, continue with safer alternatives: local harness, in-band response/error/log oracle, file/writeback oracle, app logs, database readback, or timing differential.
- For OOB/DNS probes, generate a unique token per hypothesis/route, record `token -> hypothesis -> route -> expected callback`, and treat callback evidence as confirmation only when the token maps to the active one-variable probe.
- Prefer Interactsh DNS-only canaries before HTTP/LDAP/RMI/reverse-shell stages. Do not send the user's local machine secrets, personal credentials, non-CTF data, or out-of-scope target data through Interactsh or other third-party OOB collectors.

### Local harness option when the app will not boot

- Extract/decompile only the target controller/service/mapper/parser/security class.
- Mock `HttpServletRequest`, `HttpSession`, Spring DTO binding, `MultipartFile`, `Model`, service dependencies, mapper/database, filesystem, HTTP client, and security context.
- Test payload families against the target method and capture the oracle: constructed SQL/HQL, file path escape, command string, URL destination, parser invocation, deserialization call, role decision.
- Mark `confirmed` only after class/method/line + controlled data shape + sink/condition + oracle are all present.

### Knowledge dispatch

- For Java Web evidence, query local pattern cards with terms like `java-web spring actuator`, `java-web shiro rememberme`, `java-web mybatis dollar`, `java-web upload jsp`, `java-web thymeleaf spel`, `java-web deserialization parser`.
- Use `ctf-pattern-card-search` before long medium/hard exploration; convert one selected card with `ctf-pattern-to-hypothesis` and probe exactly its first safe check.
- Search lessons for anti-patterns when a branch is based only on dependency names, blind gadget attempts, full third-party decompilation, upload without served-path proof, or template guesses without engine proof.

### Decision controller: Java Web mode

- Use `ctf-decision-engine` with `ctf-common` for non-trivial Java Web challenges.
- First choose profile: `direct` for config/source one-hop solves; `medium` for top-3 route/sink hypotheses; `hard` for multi-stage auth/dependency/bytecode chains.
- Keep at most top 3 hypotheses with: route, auth boundary, controlled input, sink, primitive, oracle, plausible flag path, Value, Confidence, InfoGain, Cost, Risk, StateDamage, Stability, first safe check, kill/pivot rule.
- Score by `(2*Value + Confidence + InfoGain + Stability) - (Cost + Risk + StateDamage)`.
- Cap Confidence at 3 unless route reachability and controlled data shape are proven.
- Cap Value at 3 unless primitive reaches flag/config/admin/source or a composable chain.
- Before each probe, state confirm/falsify/distinguish conditions.
- Stop after 2 same-family Java payloads with no new parser/error/status/body/timing/writeback differential; pivot to source/config/auth/filter/flag-location backward slice.
- If Java branch stalls, load `java-fallback-matrix.md` if available, otherwise choose one stage-specific fallback: config/control plane, route-auth table, source-slice focus, local harness, or pattern-card alternate family.
- After a primitive is confirmed, stop broad Java scanning and move to closure: config/flag file read, admin-only route, actuator/H2/source leak, upload/writeback, JNDI/deser-to-command, or dependency-gated gadget only if the route/config/data-shape gates are proven.

### Rules

- Work only on authorized CTF, lab, benchmark, or local targets.
- Do not run CVE/gadget payloads from dependency name alone.
- Do not full-decompile third-party libraries before app route/sink evidence.
- Treat secret-like config values as sensitive; use key names/locations and do not print full values.
- Prefer minimal reproducible request/script and write only verified final flag to `agent_flag.txt`.
