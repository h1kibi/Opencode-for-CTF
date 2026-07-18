---
description: Analyze challenge artifacts — run unified file triage, source/binary analysis, and vulnerability detection rules.
agent: ctf-fast
subtask: false
---

# CTF Artifact Analysis

Run `ctf-artifact-analyze build target=<path>` to build a structured analysis of the challenge artifact.

Audit rules are in `knowledge/audit-rules/`. Query by vulnerability class:

```
ctf-artifact-analyze query slug=<slug> ruleset=command-injection
ctf-artifact-analyze query slug=<slug> ruleset=sqli
ctf-artifact-analyze query slug=<slug> ruleset=ssti
ctf-artifact-analyze query slug=<slug> ruleset=ssrf
ctf-artifact-analyze query slug=<slug> ruleset=deser
ctf-artifact-analyze query slug=<slug> ruleset=path-traversal
ctf-artifact-analyze query slug=<slug> ruleset=weak-crypto
```

Challenge/target:
$ARGUMENTS

Rules:
- Work only on provided CTF/lab/local artifacts.
- Run `build` first, then `query` with relevant rulesets.
- Review `work/analysis/<slug>/artifact.db.json` for full findings.
- Use findings to inform exploit strategy; do not treat tool output as final proof.
