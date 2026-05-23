---
name: ctf-web-ssti
description: Use for authorized Web CTF server-side template injection challenges involving reflected template expressions, template engine errors, sandbox escapes, filter bypass, or template-based RCE/file read.
compatibility: opencode
---

# CTF Web SSTI

## Purpose

Use this skill when user input may be evaluated by a server-side template engine. The workflow mirrors AWE's context-aware SSTI strategy: fast rule-based probes, context/filter analysis, then adaptive payloads only if needed.

## Scope

Use only on authorized CTF/lab/local targets. Prefer harmless arithmetic probes before RCE or file-read payloads.

## Inputs

Collect:

- Reflected parameters, templates, framework, route handlers, render calls, and baseline response.
- Reflection context: HTML body, attribute, script, JSON, plain text, email/template file, or error page.
- Filters or transformations observed in responses.

## Workflow

1. Find reflection points and template render paths from source or responses.
2. Establish baseline response for a canary string.
3. Test minimal arithmetic probes appropriate to common engines, recording exact response differences.
4. If an engine signal appears, fingerprint engine family from syntax, errors, framework, or source.
5. Inject a canary to locate reflection context and escaping behavior.
6. Detect filters and blocked characters with small differential probes.
7. Escalate from expression evaluation to controlled file read or command execution only when required for the flag.
8. Build a deterministic solver request sequence.

## Engine Fingerprint Checklist

- Flask/Jinja2: Flask imports, Jinja errors, `render_template_string`, `{{7*7}}` style arithmetic.
- Twig/Smarty: PHP/Symfony/Twig errors, `.twig`, Smarty delimiters, PHP template stack traces.
- Freemarker/Velocity/Thymeleaf: Java/Spring stack traces, `.ftl`, `.vm`, `.html` templates, expression syntax errors.
- EJS/Pug/Handlebars: Express view engine, `.ejs`, `.pug`, `.hbs`, server-side render calls.
- Go templates: `html/template`, `text/template`, Go error strings, `{{printf ...}}` behavior.
- ERB/Ruby: Rails/Sinatra templates, `.erb`, Ruby exception names.

## Context And Filter Checklist

- Reflection context: text, attribute, script, JSON, URL, template file, or error page.
- Escaping: HTML entities, quotes, braces, percent encoding, slash escaping.
- Blocked characters: braces, quotes, underscores, dots, brackets, pipes, spaces, keywords.
- Output transformation: truncation, lowercasing, normalization, markdown, sanitizer, or template autoescape.

## Tool Discipline

- Do not start with destructive RCE payloads.
- Keep a list of failed probes and blocked characters to avoid loops.
- Distinguish client-side template behavior from server-side rendering.
- Record engine evidence, context, filters, and payload transformations in `notes.md`.

## Evidence Requirements

A confirmed SSTI needs:

- Input location and baseline.
- Probe that evaluates server-side or source showing unsafe template rendering.
- Engine/context/filter evidence.
- Impact path to flag, file read, or controlled execution.

## Output Contract

`solve.py` should reproduce the final request and print the verified flag. `notes.md` should contain engine fingerprint, successful payload, failed payload classes, and why the final payload works.

## Stop Conditions

Stop or ask when only client-side rendering is observed, probes are blocked without useful context, exploitation would be destructive, or the next step requires out-of-scope network callbacks.
