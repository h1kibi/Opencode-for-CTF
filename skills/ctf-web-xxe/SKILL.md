---
name: ctf-web-xxe
description: Use for authorized Web CTF challenges involving XML parsers, XXE, SVG uploads, Office document XML parsing, SOAP endpoints, SAML assertions, or XSLT transforms.
compatibility: opencode
---

# CTF Web XXE

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
