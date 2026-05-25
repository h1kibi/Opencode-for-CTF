---
name: ctf-web-patterns
description: Use for authorized Web CTF challenges when confirmed recon signals need matching against known CTF exploit patterns, bypass families, historical challenge techniques, parser discrepancies, framework quirks, CVE-shaped playbooks, or language-specific web exploitation notes. Use after recon and attack-queue, not before initial mapping.
compatibility: opencode
---

# CTF Web Patterns

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
