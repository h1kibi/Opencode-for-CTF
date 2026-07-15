---
description: CTF helper: DeepAudit-derived white-box audit loop for source/archive/bytecode/config challenges
agent: ctf-master
subtask: false
---

# /ctf-whitebox - source-first exploit audit

Use this when the challenge provides source, partial leaks, JAR/WAR/class files, Docker/config/dependency manifests, or generated API specs.

Challenge/artifact:
$ARGUMENTS

## Required loop

1. Load/use `ctf-whitebox-audit`.
2. Initialize or update the tool-backed audit handoff with `ctf-whitebox-handoff operation=init/report` before exploitation:
   - stack/runtime/dependency files
   - entrypoints/routes/handlers
   - auth/filter/role boundaries
   - sources: query/body/path/cookie/header/file/env/config/db
   - sinks: command/file/sql/template/ssrf/redirect/deser/xml/crypto/upload/archive
   - sanitizers/validators/transforms
   - candidate findings and false-positive checks
3. Seed candidates using the best source mapper first:
   - Web source: `ctf-web-source-map`
   - Java source: `ctf-java-map`, `ctf-java-config-map`, `ctf-java-source-slice`, `ctf-java-dep-risk`
   - JAR/WAR: `ctf-java-archive-map`, `ctf-safe-extract`, `ctf-java-bytecode-hints`, selected decompile
   - API spec/path list: `ctf-api-map`
4. Record normalized facts using `ctf-whitebox-handoff operation=add_entrypoint|add_auth|add_source|add_sink|add_finding|add_probe`.
5. Convert findings to top-3 hypotheses with confirm/falsify/distinguish conditions.
6. Apply `ctf-whitebox-handoff operation=gate` before `confirmed`.
7. If app boot is expensive, use `ctf-local-harness-verifier operation=plan|write|run|evaluate`: extract target function/class, mock dependencies, test payload families, record oracle.
8. Convert confirmed primitive into closure path before broadening.

## Output contract

Return compactly:

1. Artifact/stack classification.
2. Audit handoff summary.
3. Route/Input/Sink/Auth table.
4. Top-3 hypothesis queue.
5. Evidence gate table.
6. Local harness plan or result.
7. Primitive-to-chain closure queue.
8. Exactly one next action.

Do not dump raw SAST output. Do not mark scanner-only hits as confirmed.
