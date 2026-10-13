---
name: ctf-web-oauth
description: Use when Web CTF evidence mentions OAuth, OIDC, SAML, redirect_uri, state, nonce, auth code, token callback, JKU/JWK/JWT trust, IdP, or open redirect chained to login.
compatibility: opencode
---

# CTF Web OAuth/OIDC/SAML

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Output Contract

Return a compact result containing confirmed facts, unresolved uncertainty, attempted discriminator, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching oauth signal; do not use it for generic Web recon.

Use this skill as a focused trigger, not a broad auth checklist.

First safe checks:

- Map the flow: client_id, redirect_uri, state, nonce, code/token response mode, issuer, audience, callback route, and post-login account binding.
- Test redirect_uri validation with same-origin open redirects, path confusion, subdomain tricks, fragment/query handling, and exact-match vs prefix-match behavior.
- Check state/nonce binding and code reuse/replay only with controlled accounts.
- If JWT/JWK/JKU/KID appears, switch to token-shape classification and `ctf-web-jwt`, with `ctf_rag` recall for token-shape techniques.
- Treat open redirect as high-value only when it reaches OAuth token/code theft, SSRF, or trusted callback abuse.

Pattern recall queries:

- `OAuth redirect_uri state nonce open redirect token theft`
- `OIDC issuer audience callback code reuse account binding`
- `SAML OAuth IdP trust boundary CTF`

References in local mirror:

- `ctf-web/auth-infra.md`
- `ctf-web/auth-and-access.md`
- `ctf-web/auth-jwt.md`
