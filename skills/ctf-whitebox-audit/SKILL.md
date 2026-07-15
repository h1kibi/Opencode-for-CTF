---
name: ctf-whitebox-audit
description: Use when a CTF challenge provides source code, bytecode, archives, containers, dependency manifests, or partial leaked files and the goal is maximal white-box audit capability before exploitation.
compatibility: opencode
---

# CTF White-box Audit

## Purpose

Maximize source-assisted CTF solving by turning files into an exploit-oriented map, not a generic SAST report. Prioritize route/input/sink/auth/dependency evidence and convert it into a small hypothesis queue.

This skill absorbs the DeepAudit-style white-box loop, but keeps it CTF-oriented: **Recon → Attack Surface Model → Candidate Findings → Evidence Gate → Local Harness Verification → Primitive-to-Chain Closure**. Do not stop at a vulnerability report; every confirmed issue must be translated into a primitive and then into the shortest path toward flag access.

## DeepAudit-derived Operating Contract

Use this contract whenever source, bytecode, config, dependency manifests, or partial leaked files are available:

1. **Structured handoff over prose**: every phase must preserve a compact handoff object with facts, unknowns, false-positive checks, and next probes.
2. **Professional tools first, LLM judgment second**: use CTF source mappers, AST/grep/semgrep/dependency tools to seed candidates; use reasoning to validate context and exploitability, not to hallucinate files.
3. **Evidence gate before confidence**: no finding may be called confirmed without a real file/symbol/line or runtime oracle.
4. **Verifier is adversarial**: verification must try to falsify the finding before composing a chain.
5. **Local harness beats full app boot**: if the service is hard to run, extract the vulnerable function/class/handler, mock dependencies, fuzz payload families, and define a success oracle.
6. **Primitive-to-chain closure**: once a primitive is verified, stop broad scanning and compose the shortest chain to flag/config/admin/source/read/write/RCE.

### Dedicated Tools

- Use `ctf-whitebox-handoff` to create and maintain `.ctf-whitebox-handoff.json` instead of relying only on prose notes.
- Use `ctf-local-harness-verifier` for harness `plan`, `write`, safe `run`, and `evaluate` operations. It defaults to non-execution; set `allowRun=true` only after reviewing generated code and confirming CTF/local scope.

## Audit Handoff Schema

Maintain this mentally or in `notes.md` / `.ctf-whitebox-handoff.json` for non-trivial challenges:

```json
{
  "scope": {"root": "", "target_files": [], "excluded": []},
  "stack": {"languages": [], "frameworks": [], "runtime": "", "dependency_files": []},
  "entrypoints": [{"route_or_file": "", "handler": "", "method": "", "line": 0}],
  "auth_boundaries": [{"route_or_file": "", "guard": "", "role_condition": "", "bypass_suspicion": ""}],
  "sources": [{"name": "", "kind": "query|body|path|cookie|header|file|env|config|db", "file": "", "line": 0}],
  "sinks": [{"kind": "command|file|sql|template|ssrf|redirect|deser|xml|crypto|upload|archive", "api": "", "file": "", "line": 0}],
  "sanitizers": [{"name": "", "file": "", "line": 0, "coverage": ""}],
  "candidate_findings": [],
  "candidate_chains": [],
  "verified_facts": [],
  "false_positive_checks": [],
  "priority_areas": [],
  "next_probes": []
}
```

### Handoff Rules

- Put only observed facts in `entrypoints`, `sources`, `sinks`, and `auth_boundaries`.
- Put guesses in `candidate_findings` with confidence capped at medium until evidence-gated.
- Every `next_probes[]` item must have `confirm`, `falsify`, and `distinguish` conditions.
- Add `false_positive_checks[]` before claiming a finding: file exists, snippet matches, input is controllable, sanitizer coverage, route reachability, auth reachability, output oracle.
- Prefer updating the handoff with `ctf-whitebox-handoff operation=add_*` after each meaningful source-map/slice result so later chain decisions consume normalized facts.

## Evidence Gate

Classify findings with this gate:

| Verdict | Minimum evidence |
|---|---|
| `confirmed` | Real file/symbol/line + controlled input or reachable config + sink/condition + static slice or runtime/harness oracle. |
| `likely` | Real file/symbol/line + plausible source-to-sink, but missing runtime/harness proof or one reachability condition. |
| `uncertain` | Suspicious pattern exists, but controllability, route reachability, sanitizer bypass, or output oracle is unclear. |
| `false_positive` | File missing, snippet mismatch, input not controllable, sanitizer fully covers sink, auth path unreachable, dependency/config gate absent. |

Never upgrade a knowledge-base example, pattern-card hit, or scanner line to `confirmed` until it passes this gate.

## Local Harness Verification

When a project cannot be fully run, use a local harness instead of stalling:

1. Extract the smallest handler/function/class around the sink using `read`, `grep`, `ast_grep_search`, `lsp_*`, `ctf-java-source-slice`, or `ctf-java-decompile-targets`.
2. Mock dependencies: request object, DB cursor/mapper, filesystem, HTTP client, template renderer, auth context, environment/config.
3. Test multiple payload families, not one payload.
4. Define a success oracle before running: command string captured, SQL string unparameterized, path escapes base dir, URL reaches internal host, template expression evaluates, deserializer invokes gadget, role check bypassed.
5. Record harness outcome as `confirmed|likely|uncertain|false_positive` and immediately feed confirmed primitives into chain composition.

Harness output contract:

```json
{
  "finding_id": "",
  "target": {"file": "", "symbol": "", "line": 0, "language": ""},
  "mock_plan": [],
  "payloads_tested": [],
  "success_oracle": "",
  "observed_signal": "",
  "verdict": "confirmed|likely|uncertain|false_positive",
  "chain_implication": "file-read|file-write|ssrf|auth-bypass|rce|secret-leak|none"
}
```

Use `ctf-local-harness-verifier operation=plan` first, then `write`, and only then `run` if the harness code has no risky side effects or all risky side effects are mocked. For unsafe patterns, keep the output as `planned` or `likely` and perform manual review in a disposable sandbox.

## Primitive-to-Chain Closure

After any primitive is verified, ask only chain questions until closure or blocker:

- `file-read` → read config/env/source/flag candidates → credential/session/admin route → flag.
- `file-write` → served path/reload/template/session/log poisoning → RCE or flag write/readback.
- `ssrf` → internal admin/metadata/redis/gopher/file/proxy → credential or local-only route.
- `auth-bypass` / `idor` → admin-only sink/state-changing route/object ownership → flag.
- `template/code/command/deser` → command/file read primitive → minimal flag path.
- `secret-leak` → verify scope without printing full secret → login/sign token/decrypt config → closure.

If closure stalls, record blocker and bypass family before pivoting.

## Tool Priority

Use tools in this order unless the challenge format strongly says otherwise:

0. Run `ctf-whitebox-env-check` once per fresh workspace/session when external CLI availability is unknown. If required tools are missing, follow the fallback matrix instead of repeatedly calling unavailable commands.
1. Built-in CTF mappers: `ctf-one-shot-triage`, `ctf-web-source-map`, `ctf-java-*`, `ctf-api-map`, `ctf-file-triage`.
2. Fast text/structure search: `rg`, `fd`, `jq`, `yq`, `ast-grep`.
3. Rule-driven scan: `semgrep` with focused configs or temporary CTF-specific rules.
4. Deep dataflow: `codeql` only after language/framework and likely sinks are known.
5. Secrets/dependencies: `gitleaks --redact`, `trivy fs`, `osv-scanner`, language package audit tools.
6. Java archive/bytecode: `jar`, `javap`, `CFR`, `jadx`, Maven/Gradle dependency tree.
7. Language-specific scanners only when they match the detected stack: `bandit`, `pip-audit`, `gosec`, `govulncheck`, `brakeman`, `composer audit`, `npm audit`, `pnpm audit`, `retire`.

## Required Workflow

1. Identify artifact type and stack:
   - Source tree, JAR/WAR, Docker project, API spec, binary-with-source, mobile package, or mixed leak.
   - Record language, framework, dependency files, runtime, and entrypoint.
2. Build a source map before exploitation:
   - Routes/controllers/handlers.
   - Inputs: query, path, body, files, cookies, headers, environment, config.
   - Auth and role checks.
   - Sinks: command, file, template, SQL/NoSQL, SSRF, redirect, deserialization, XML, crypto, upload/archive extraction.
   - Output/control channel: direct response, file served path, logs, admin bot, DB-visible field, OOB.
3. Run focused scanning:
   - If CLI availability is unknown, run `ctf-whitebox-env-check` first.
   - Use `rg`/`ast-grep` first to find reachable code and dangerous APIs.
   - Use `semgrep` for stack-specific sink families and custom one-off rules.
   - Use `codeql` only when cross-function dataflow is valuable or manual trace is ambiguous.
4. Dependency and config audit:
   - Inspect `pom.xml`, `build.gradle`, `package.json`, lockfiles, `requirements.txt`, `go.mod`, `composer.json`, `Gemfile`, Dockerfiles, `application.*`, `.properties`, `web.xml`.
   - Prefer version-gated CTF patterns over generic CVE lists.
5. Produce a compact exploit queue:
    - Top 3 hypotheses with value/confidence/infoGain/cost/risk/stateDamage/stability.
    - One-variable probe contract for each high-value hypothesis.
    - Stop broad scanning once a high-value primitive is confirmed.
6. Run the evidence gate and, when needed, local harness verification before calling a finding confirmed.
7. Convert confirmed findings to primitive-to-chain closure tasks; do not keep collecting unrelated SAST findings after a direct flag path emerges.

## Missing Tool Fallback Matrix

Do not loop on a missing external CLI. Use these fallbacks immediately:

| Missing Tool | Fallback |
|---|---|
| `rg` | Use built-in `grep`, `glob`, source-map tools, or a small language script. |
| `fd` | Use `glob`, `find`, or source-map inventory. |
| `jq` | Use Python `json` snippets or direct manifest reads. |
| `yq` | Use direct YAML reads, `grep`, or Python YAML if already available. |
| `semgrep` | Use `rg` + `ast-grep` + manual source slices with the same sink families. |
| `codeql` | Use Semgrep/manual dataflow; only install/escalate if cross-function ambiguity blocks progress. |
| `gitleaks` | Use redacted `rg` patterns for `secret`, `token`, `key`, `password`; never print full secrets. |
| `trivy` | Parse manifests and use `osv-scanner` or manual CTF version gates. |
| `osv-scanner` | Use `trivy fs` or manual dependency version review. |
| `jadx`/CFR | Use `javap`, `ctf-java-bytecode-hints`, and selective class constants first. |

## CTF-focused Semgrep Families

Generate temporary Semgrep rules or run focused configs for:

- Java: `Runtime.exec`, `ProcessBuilder`, `ObjectInputStream`, `readObject`, `InitialContext.lookup`, XML parser features, SpEL/OGNL/EL evaluation, `JSON.parseObject`, Jackson default typing, SnakeYAML `load`, Shiro rememberMe, raw SQL construction.
- Python: `eval`, `exec`, `pickle.loads`, `yaml.load`, `subprocess` with `shell=True`, `os.system`, `render_template_string`, unsafe file paths, `requests` with user-controlled URL.
- Node.js: `child_process`, `eval`, `Function`, `vm.runIn*`, object merge with `__proto__`, template engines, `node-serialize`, JWT misuse, unsafe redirects, multer/upload paths.
- PHP: `unserialize`, variable `include`/`require`, `file_get_contents`, `eval`, `assert`, `system`/`exec`, `phar`, `extract`, Twig/Smarty template rendering.
- Go: `exec.Command`, `template.HTML`, raw SQL construction, unsafe archive extraction, user-controlled HTTP fetch, path join/clean misuse.

## Java Web Specialization

For JAR/WAR/Spring/Servlet challenges:

1. List archive members and configs before extracting broadly.
2. Map `application.*`, `web.xml`, controller annotations, filters/interceptors/security config.
3. Decompile only target classes from bytecode hints first.
4. Check dependency gates: Fastjson, Log4j, Shiro, Struts, Jackson, SnakeYAML, XStream, Commons Collections, Spring Cloud Gateway.
5. Distinguish direct HTTP JSON parser bugs from dependency-as-gadget cases. If Log4j/JNDI and Fastjson appear together, consider `Log4j JNDI -> JDK gate -> LDAP javaSerializedData -> Fastjson gadget` before treating Fastjson as a direct JSON endpoint.

## Secret Handling

Use secret scanners to identify challenge-relevant keys, but do not print full secrets. Prefer redacted output and record only:

- file path
- line number
- secret type
- short fingerprint or last 4 chars if needed
- how it affects the exploit hypothesis

## Source-First Macro Integration

Use `ctf-source-first-pack` when a challenge contains mixed source, leaked files, Docker/config, API specs, dependency manifests, bytecode, or generated/static artifacts and the owner is not yet stable.

The macro should answer four questions before remote guessing:

1. What language/framework/runtime and dependency files exist?
2. Which entrypoints, routes, handlers, configs, and auth boundaries are visible?
3. Which sink families are present and which have route/input reachability?
4. Which first safe tool or harness plan should run next?

Feed its top output into `.ctf-whitebox-handoff.json` through `ctf-whitebox-handoff`, then promote at most three exploit hypotheses into `ctf-decision-state`.

## White-box Stop Conditions

Stop broad source scanning and enter closure when any confirmed finding creates one of these primitives:

- direct flag/config/source read;
- admin/session/token/role boundary;
- route-auth bypass to a sensitive handler;
- file-write with readback/consumer;
- SSRF/internal read;
- template/code/deserialization/command primitive with a stable output channel.

If a scanner returns many findings, summarize only the top evidence-gated candidates. Do not paste full scanner output into state or final reports.

## Output Contract

Append or maintain in `notes.md`:

```markdown
# White-box Audit Map

## Stack
- Artifact:
- Language/framework:
- Entrypoint/runtime:
- Dependency files:

## Route/Input/Sink/Auth Map
| Route/File | Input | Auth/Guard | Sink | Constraint | Candidate Primitive |
|---|---|---|---|---|---|

## Dependency/Config Findings
| File | Signal | Version/Value | CTF Relevance | First Safe Check |
|---|---|---|---|---|

## Scanner Evidence
| Tool | Scope | Finding | Evidence | Follow-up |
|---|---|---|---|---|

## Hypothesis Queue
| ID | Hypothesis | Confirm | Falsify | Next Probe |
|---|---|---|---|---|

## Evidence Gate
| Finding | File/Symbol/Line Verified | Controllability | Sink/Condition | Oracle/Harness | Verdict | False-positive Checks |
|---|---|---|---|---|---|---|

## Local Harness / Verification
| Finding | Mock Plan | Payload Families | Success Oracle | Observed Signal | Verdict | Chain Implication |
|---|---|---|---|---|---|---|

## Primitive-to-Chain Ledger
| Primitive | Evidence | Next Closure Step | Blocker | Bypass/Pivot |
|---|---|---|---|---|
```

Keep the output exploit-oriented and compact. Do not dump full SAST reports into the final answer.
