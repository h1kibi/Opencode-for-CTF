# CTF Rules

Reserved for CTF-only cross-category rules that should be loaded by CTF agents, not daily mode.
Keep this file minimal; prefer specialized ctf-* skills/commands for category-specific guidance.

## Rule Ownership Boundary

Use this file only for truly cross-category, always-on CTF rules that multiple agents should inherit directly.

- Put global silence / reporting thresholds, source-first evidence boundaries, parser-family closure pressure, and OOB capability gates here.
- Put reusable execution discipline, same-family limits, primitive-lock expectations, and checkpoint shape in `ctf-common`.
- Put hypothesis ranking, knowledge gates, probe contracts, and `ctf-decision-state` invocation rules in `ctf-decision-engine`.
- Put anti-drift pressure, semantic-mismatch promotion, and exploration budgets in `ctf-experience-gate`.
- Put resume hygiene, best-evidence snapshots, and pivot bookkeeping in `ctf-ledger-discipline`.
- Put domain-specific ladders, sinks, runtime/tool order, and closure details in the category agents or category skills.

If a new rule can be owned by a shared skill or a single category, do not add it here.

## Silent Solve Mode

Enter Silent Solve Mode when the user explicitly asks to continue until the flag or final result before reporting, **or when the user's wording implies a final-result contract**.

Final-result contract examples include: "帮我拿到 flag", "继续直到出 flag", "自己独立解出，最后告诉我", "最后诚实告诉我是否解出", "不要中途汇报", "打到结果为止", or equivalent phrasing in Chinese or English.

In Silent Solve Mode, do not proactively report intermediate branch failures, partial observations, probe results, payload failures, path-variant failures, parameter differentials, tentative hypotheses, routine pivots, incremental recon/calibration status, or "not solved yet" progress summaries.

A statement such as "最后告诉我是否独立解出" is **not** permission to send interim status. It means report independence/solve status only at final success, strict stuck gate, or another allowed reporting threshold.

Only these five cases may be proactively reported to the user:

1. A real flag is found.
2. User-provided resources are required, such as an OOB domain, VPS, listener endpoint/port, credentials, or challenge-specific access material.
3. A safety or scope decision is required from the user.
4. A strict stuck gate is reached: the solver is genuinely blocked and continuing would be blind or low-value.
5. The target is unavailable, unstable, or the next action carries destructive/high-risk impact.

Outside these five cases, continue solving silently and track state internally.

## Silent Execution Default

After the initial route is stable and the first useful hypothesis or attack queue exists, default to silent execution for low-risk probes. Do not send user-facing progress summaries for incremental recon, calibration, same-branch probe results, or unsolved partial states unless one of the Silent Solve Mode reporting thresholds applies, or the user explicitly asks for a progress update.

For CTF rigorous mode, silence is the default once active solving has begun. If the next action is a low-risk probe/tool call/pivot and no reporting threshold is met, continue solving instead of summarizing.

Internal gates, ledgers, mode transitions, chain-state updates, and hypothesis reranks should be tracked internally or with state tools by default. They do not require user-facing narration unless they materially change risk, closure path, owner handoff, consent boundary, or one of the five Silent Solve Mode reporting thresholds.

When user-facing progress is necessary, keep it concise and decision-relevant. Otherwise, prefer continuing the authorized low-risk solve silently until a reporting threshold is reached.

## White-box Evidence Discipline

When source, bytecode, config, API specs, Docker files, dependency manifests, or partial leaks are available, prefer source-guided solving and apply the `ctf-whitebox-audit` evidence gate:

- Scanner, RAG, SecKB, pattern-card, or model-only hits are hypotheses, not confirmed findings.
- A source-derived finding needs real file/symbol/line evidence plus controllability/reachability and a sink/condition before it can drive exploitation.
- If full service boot is expensive, use local harness verification: extract the smallest target function/class/handler, mock dependencies, test payload families, and record the success oracle.
- Once a primitive is confirmed, stop broad scanning and prioritize primitive-to-flag closure.

## Parser Sink Closure Rule

When source or bytecode confirms a parser sink with a known exploit family, switch from generic payload variation to parser-family closure immediately.

Examples:
- `WorkbookFactory.create(InputStream)` or POI/XMLBeans with OOXML/XLSX -> prioritize standard OOXML XXE entrypoint order before unrelated file-read filter bypasses or upload-write speculation.
- XML parser factories / SAX / DOM / XMLBeans -> prioritize XXE entrypoint + external resource / DTD reachability checks.
- `ObjectInputStream.readObject` / Fastjson / Jackson default typing / XStream / SnakeYAML -> prioritize deserialization gate checks before route fuzzing.

For OOXML/XLSX specifically, use this entrypoint order unless source disproves it:
1. `[Content_Types].xml`
2. `_rels/.rels`
3. `xl/workbook.xml`
4. `xl/worksheets/sheet*.xml`
5. `docProps/*.xml`

If two payloads fail with parser-context errors such as entity placement restrictions, internal-subset restrictions, or parser-specific malformed-content exceptions, stop mutating the same XML part and switch entrypoint.

## OOB Infrastructure Gate

Before committing to an XXE / blind parser / callback branch, distinguish these attacker capabilities explicitly:

- **Receive-only OOB**: can observe DNS/HTTP callbacks (for example Interactsh).
- **Response-serving OOB**: can return attacker-controlled content such as `evil.dtd`, staged XML, second-hop redirects, or JavaScript payload bodies.

Rule:
- External DTD / staged XXE / second-phase fetch chains require **response-serving OOB**, not receive-only OOB.
- Interactsh-style services are sufficient for callback confirmation and some exfil channels, but are **not** sufficient when the target must fetch attacker-defined DTD/body content unless a separate controllable HTTP server exists.
- If the top branch requires response-serving OOB and none is available, ask the user for VPS/HTTP hosting/approved infrastructure early instead of continuing blind payload mutation.
