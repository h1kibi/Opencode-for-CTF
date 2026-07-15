Use this reference when a dedicated Web tool fails or aborts. It is a routing aid, not a scanner.

# Web Tool-Family Fallback Matrix

## Core rule

- Internal reasoning may continue, but visible output after a failed tool should be one action sentence: `RETRY_WITH_REASON`, `FALLBACK_TO_<tool>`, `PIVOT`, or `FINAL`.
- Prefer the closest lower-risk or missing-evidence tool.
- Do not jump to shell/curl when a dedicated Web tool can answer the question more directly.
- Return to `ctf-decision-state` only when you have a valid non-empty hypothesis/probe/gate object.

## Family A — Recon / profile tools

Tools:
- `ctf-web-probe`
- `ctf-web-fingerprint`
- `ctf-web-blackbox-map`

Typical failures:
- timeout / aborted
- no body or partial body
- insufficient route/state hints

Fallback order:
1. `ctf-web-fingerprint` for headers/server/profile baseline
2. `ctf-web-blackbox-map mode=light` for URL-only surface model
3. `ctf-web-js-surface-map` if HTML/scripts suggest JS-heavy routes
4. one browser body/runtime check if browser-only evidence exists or text/body is still unknown

Do not:
- repeat the same recon call unchanged more than once
- switch to shell/curl before trying the closest dedicated recon fallback

## Family B — Differential tools

Tools:
- `ctf-web-diff-probe`
- `ctf-web-reflection-map`
- `ctf-web-authz-matrix`

Typical failures:
- endpoint unsuitable
- missing stable oracle
- object IDs/session pair unavailable
- request shape unsupported

Fallback order:
1. `ctf-web-template-check` to remap signals into one safer check
2. `ctf-web-state-machine-map` if the issue is workflow/state/auth-related
3. `ctf-web-blackbox-map` if the endpoint/state model is still unclear
4. retry exactly once only if one variable meaningfully changed and the oracle remains valid

Do not:
- pivot straight to shell/curl as a generic next step
- spam alternate payloads when the endpoint/oracle model is still weak

## Family C — Selector / model tools

Tools:
- `ctf-web-template-check`
- `ctf-web-state-machine-map`
- `ctf-web-js-surface-map`
- `ctf-web-runtime-map`

Typical failures:
- evidence too weak
- too little JS/runtime context
- target not stateful enough

Fallback order:
1. `ctf-web-fingerprint`
2. `ctf-web-blackbox-map mode=light`
3. one browser check if browser/runtime evidence is specifically missing
4. `ctf-skill-repo-search` or `ctf-pattern-card-search` when you need pattern recall rather than target discovery

Do not:
- force a state-machine or template-family interpretation without enough evidence

## Family D — Source / sink / pattern tools

Tools:
- `ctf-pattern-card-search`
- `ctf-pattern-to-hypothesis`
- `ctf-skill-repo-search`
- `ctf-web-source-map`

Typical failures:
- weak query terms
- too many generic hits
- source tree too small / too broad

Fallback order:
1. tighten the query with exact sink/function/framework names
2. use one stronger evidence phrase from source/error/JS/header
3. convert one top card only
4. if no good card exists, return to constraint equation and write one minimal hypothesis manually

Do not:
- chain multiple cards without evidence
- call `ctf-decision-state` before you have a non-empty hypothesis

## Family E — Browser / runtime checks

Tools:
- `browser_navigate`
- `browser_evaluate`
- `browser_screenshot`

Use only when:
- SPA/DOM/admin-bot/postMessage/storage/CSP/runtime evidence exists
- body text is still unknown after dedicated Web tools
- you need browser-only network/runtime signals

Fallback order when browser check fails:
1. `ctf-web-fingerprint`
2. `ctf-web-blackbox-map`
3. `ctf-web-js-surface-map`
4. `ctf-web-runtime-map`

Do not:
- use browser as the first fallback for everything
- replace reproducible HTTP behavior with browser-only clicking unless required by the challenge

## Decision-state safety reminder

Never call `ctf-decision-state` with:
- empty `hypothesesJson`
- empty `probeJson` for `probe`
- empty `gateJson` for `gate`
- empty `observationJson` for `observe`

If not ready:
- build one minimal hypothesis
- or run `ctf-pattern-to-hypothesis`
- or write the smallest valid queue from evidence
