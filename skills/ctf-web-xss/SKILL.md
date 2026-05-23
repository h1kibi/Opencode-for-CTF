---
name: ctf-web-xss
description: Use for authorized Web CTF XSS challenges involving reflected, stored, DOM, blind/admin-bot XSS, CSP bypass, HTML/JS context escaping, or cookie/flag exfiltration in lab targets.
compatibility: opencode
---

# CTF Web XSS

## Purpose

Use when user input may execute in a browser context. Prioritize context discovery, minimal proof, browser verification, and challenge-scoped exfiltration.

## Signals

- Reflected input in HTML/attributes/scripts/URLs.
- Stored comments, profiles, notes, uploads, markdown, or admin bot visits.
- DOM sinks such as `innerHTML`, `document.write`, `eval`, `setTimeout`, `location`, or template literals.
- CSP headers or sanitizer libraries.

## Workflow

1. Identify reflection or storage point and browser context.
2. Establish a harmless canary and observe encoding/escaping.
3. Determine context: HTML text, attribute, JavaScript string, URL, CSS, markdown, SVG, or DOM sink.
4. Test minimal execution proof such as controlled DOM change or alert-equivalent in local/lab context.
5. Analyze filters, sanitizer, CSP, and event-handler/script restrictions.
6. For admin-bot tasks, prove the bot visit path and exfiltrate only the challenge flag/token to an allowed local/challenge endpoint.
7. Write a reproducible request/browser script.

## Context Checklist

Pick payload shape from context, not from a generic list:

- HTML text context.
- HTML attribute, quoted or unquoted.
- JavaScript string, template literal, object, or function argument.
- URL context such as `href`, redirect, or `src`.
- Markdown or sanitizer output.
- SVG/XML context.
- DOM sink and source pair.
- CSP restrictions and nonce/hash behavior.
- Stored vs reflected vs DOM vs blind/admin-bot path.

## Bypass Checklist

Try only when the context supports it:

- Entity, URL, and JavaScript escaping differences.
- Attribute breakout.
- Event handlers on allowed tags.
- SVG/MathML parser differences.
- Markdown link/image handling.
- Sanitizer mXSS or mutation behavior.
- CSP allowed origins, JSONP, nonce reuse, or unsafe-inline.
- DOM clobbering only if source uses clobberable globals.

## Evidence Requirements

- Input location and rendered context.
- Browser-observed execution or source-proven sink.
- Filter/CSP analysis if bypass is needed.
- Challenge-scoped impact path.

## Stop Conditions

Stop when payloads would target real users, require public callback infrastructure without authorization, or repeated payloads do not change the context hypothesis.
