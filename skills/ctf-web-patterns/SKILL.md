---
name: ctf-web-patterns
description: Use for authorized Web CTF challenges when confirmed recon signals need matching against known exploit patterns, bypass families, parser discrepancies, framework quirks, CVE-shaped playbooks, or language-specific notes.
compatibility: opencode
---

# CTF Web Patterns

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Output Contract

Return a compact result containing confirmed facts, unresolved uncertainty, attempted discriminator, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return matched signals and one falsifiable discriminator to `ctf-web-attack-queue`; recall may modify ranking but cannot establish a primitive.

## First Safe Action

Extract at least two concrete case signals and query the smallest matching pattern/reference set.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after recon and attack-queue identify a concrete signal whose technique or bypass family is still uncertain.

## Purpose

Use this skill as a pattern recall layer, not as the main Web workflow.

Do not use this skill to skip recon, attack-queue ranking, attempt budgets, primitive lock, control-plane selection, or stability guard.

## When to Load

Load this skill when one or more of these are already observed:

- SQL parser/filter anomaly.
- Upload/write/include behavior.
- SSRF URL parser discrepancy.
- Template engine signal.
- Auth/session/token oddity.
- Browser/admin-bot/client-side quirk.
- XML/JSON/YAML/parser behavior.
- Dependency/version/banner/CVE-shaped clue.
- Language/framework-specific clue.

## Required Input

Before using pattern notes, the agent must have:

```markdown
# Confirmed Signals
-

# Current Phase
recon | attack-queue | focused-probe | primitive-lock | control-plane | final-chain

# Candidate Being Evaluated
-

# Risk Budget
-
```

## Pattern Use Rule

For every matched pattern, record:

| Pattern | Signals Matched | Expected Primitive | Value | Cost | Risk | First Safe Check | Stop Rule |
| ------- | --------------- | ------------------ | ----: | ---: | ---: | ---------------- | --------- |

Rules:

* Prefer patterns that explain observed evidence.
* Do not try payload families only because they are listed.
* Convert each pattern into one low-risk focused probe.
* If the probe fails and no new evidence appears, return to attack-queue.
* Do not run bulk scanners or destructive payloads from pattern notes without High-Risk Action Plan.

## References

Load only the narrow reference needed:

* `references/pattern-index.md` for top-level routing.
* `references/server-side-patterns.md` for SQLi, SSTI, SSRF, XXE, file read/write, command injection, deserialization.
* `references/client-side-patterns.md` for XSS, DOM, CSP, CORS, XS-Leak, admin bot.
* `references/auth-patterns.md` for JWT, OAuth/OIDC, SAML, session, access control.
* `references/parser-proxy-patterns.md` for URL parser, proxy, cache, request smuggling, Host header, path normalization.
* `references/language-patterns.md` for PHP, Java, Python, Node, Ruby, Go, .NET.
* `references/cve-shaped-patterns.md` only when version/banner/dependency evidence exists.
