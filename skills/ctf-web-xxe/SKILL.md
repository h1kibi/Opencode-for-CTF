---
name: ctf-web-xxe
description: Use for authorized Web CTF challenges involving XML parsers, XXE, SVG uploads, Office document XML parsing, SOAP endpoints, SAML assertions, or XSLT transforms.
compatibility: opencode
---

# CTF Web XXE

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching xxe signal; do not use it for generic Web recon.

## Purpose

Use when challenge involves XML parsing, SVG uploads, Office documents, SOAP, SAML, or any XML-based data processing.

## Signals

- XML content type or XML body in requests
- SVG/Office document upload
- SOAP endpoint
- SAML assertion processing
- XSLT transforms

## Rules

- Identify the XML parser and its configuration first.
- Test with a harmless local entity or error-based proof before file read.
- In-band XXE is higher priority than blind XXE.
- For file read, prefer reading challenge-local files.
- SSRF via XXE is lower value unless internal services exist.
- If source shows parser is hardened (disable DTD, secure processing), do not waste budget.

## Output Contract

```markdown
# XXE Map

| Endpoint | Parser | DTD Allowed | External Entity | File Read | SSRF |
|---|---|---|---|---|---|
```
