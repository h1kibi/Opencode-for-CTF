---
name: ctf-web-oauth
description: Use when Web CTF evidence mentions OAuth, OIDC, SAML, redirect_uri, state, nonce, auth code, token callback, JKU/JWK/JWT trust, IdP, or open redirect chained to login.
---

# CTF Web OAuth/OIDC/SAML

Use this skill as a focused trigger, not a broad auth checklist.

First safe checks:

- Map the flow: client_id, redirect_uri, state, nonce, code/token response mode, issuer, audience, callback route, and post-login account binding.
- Test redirect_uri validation with same-origin open redirects, path confusion, subdomain tricks, fragment/query handling, and exact-match vs prefix-match behavior.
- Check state/nonce binding and code reuse/replay only with controlled accounts.
- If JWT/JWK/JKU/KID appears, switch to token-shape classification and `ctf-web-jwt`/pattern cards.
- Treat open redirect as high-value only when it reaches OAuth token/code theft, SSRF, or trusted callback abuse.

Pattern recall queries:

- `OAuth redirect_uri state nonce open redirect token theft`
- `OIDC issuer audience callback code reuse account binding`
- `SAML OAuth IdP trust boundary CTF`

References in local mirror:

- `ctf-web/auth-infra.md`
- `ctf-web/auth-and-access.md`
- `ctf-web/auth-jwt.md`
