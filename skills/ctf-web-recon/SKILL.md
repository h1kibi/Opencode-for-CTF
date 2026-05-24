---
name: ctf-web-recon
description: Use at the start of any Web CTF challenge. Performs read-only reconnaissance: route map, parameter discovery, form inventory, cookie/header analysis, framework fingerprint, source review, debug surfaces, admin endpoints, upload/editor surfaces, bot detection, and API documentation discovery.
compatibility: opencode
---

# CTF Web Recon

## Purpose

Perform a short whole-target reconnaissance pass before any deep exploitation. This skill is the first gate in the Web solve state machine.

## Scope

Read-only. No destructive actions, no fuzzing, no writes, no high concurrency.

## Recon Checklist

Complete these before entering the attack-queue phase:

### Routes and Inputs

- Fetch homepage and same-origin linked pages.
- Check robots.txt, sitemap.xml.
- Enumerate query params, path params, form fields, JSON body keys, headers, cookies.
- Map hidden fields, CSRF tokens, anti-CSRF headers.

### Auth and Session

- Identify login/register/logout endpoints.
- Map session cookie name, flags (HttpOnly, Secure, SameSite).
- Map CSRF token mechanism.
- Identify any auth headers (Authorization, API keys, JWT in headers/cookies).

### Framework Fingerprint

- Check Server header, X-Powered-By, Set-Cookie patterns.
- Look for framework-specific paths (/admin, /swagger, /api/docs, /graphql, /actuator, /debug).
- Inspect HTML meta, script src for framework paths.
- Check error pages for stack traces or framework identifiers.

### Source and Config

- Check for exposed .git, .env, backup files, Dockerfile, docker-compose.yml, package.json, requirements.txt, pom.xml, Gemfile, go.mod.
- Read available source files for route definitions, dangerous sinks, auth middleware.

### Admin and Debug

- Check for /admin, /manage, /debug, /console, /actuator, /api, /swagger, /graphql.
- Inspect error responses for debug mode indicators.
- Look for exposed debug toolbar, profiler, or development mode settings.

### Upload and Editor

- Look for file upload forms, multipart endpoints.
- Check for rich text editors, file managers, avatar/image uploaders.
- Map editor paths (UEditor, CKEditor, TinyMCE, custom).

### Bot and Automation

- Check for admin bot, captcha, rate limit indicators in responses or challenge description.
- Identify the bot type if possible (PhantomJS, Puppeteer, custom headless browser).

## Allowed Actions

- Fetch same-origin pages with GET requests.
- Inspect HTML, headers, cookies, forms, scripts, links.
- Read source files and config files.
- Send harmless baseline requests (no payloads, no injections).
- Use one minimal harmless probe only when needed to classify an input type.

## Forbidden Actions

- Broad fuzzing or wordlist scanning.
- High-concurrency requests.
- Brute force.
- Destructive upload/write/overwrite.
- Repeated payload variants.
- SQL dump attempts.
- Blind callback chains.
- Admin-bot payload spam.
- State-changing actions without a canary plan.

## Output Contract

Write this to `notes.md`:

```markdown
# Recon Map

| Surface | Evidence | Inputs | Auth Needed | Source/Sink | Candidate Bug | Value | Cost | Risk | Stability | Next Safe Check |
|---|---|---|---|---|---|

# Framework Fingerprint

- Server header:
- Framework signals:
- Language signals:
- Debug/error evidence:
- Admin/debug/upload/editor surfaces:
- Bot/headless browser signals:

# Candidate Attack Queue Seed

| Candidate | Evidence | Expected Primitive | Why Promising | First Safe Check |
|---|---|---|---|---|
```
