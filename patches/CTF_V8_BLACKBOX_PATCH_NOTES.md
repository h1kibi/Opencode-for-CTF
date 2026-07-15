# CTF v8 Black-Box Web Patch Notes

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

This patch strengthens URL-only/source-poor Web CTF solving while preserving existing provider/model/MCP/daily configuration.

## New and upgraded tools

- Upgraded `tools/ctf-web-blackbox-map.ts`
  - Adds `mode=light|browser|deep`.
  - Outputs `tech_fingerprint`, `surface_map`, `browser_runtime_static`, `state_model`, `attack_queue_seed`, and `recommended_next`.
  - Extracts route/form/API/admin/debug/upload/source-leak signals, same-origin JS route hints, fetch/XHR targets, storage keys, CSP, DOM sinks, postMessage, and service workers.

- Added `tools/ctf-web-runtime-map.ts`
  - Static/browser-adjacent runtime intelligence for SPA/admin-bot/DOM/network-heavy targets.
  - Extracts XHR/fetch/WebSocket/EventSource, route literals, forms, interactive elements, localStorage/sessionStorage keys, cookie/security headers, DOM sinks/sources, postMessage, service workers, and admin-bot profile questions.

- Added `tools/ctf-web-diff-probe.ts`
  - One baseline + one mutant request.
  - Supports query, duplicate parameter, body, content-type, header, cookie, method, path normalization, encoding, auth-state, and cache-key differentials.
  - Returns `decision_state_observe_hint` for `ctf-decision-state observe`.

- Added `tools/ctf-web-authz-matrix.ts`
  - Compares anonymous/user_a/user_b across one or two object IDs.
  - Detects IDOR/authz/workflow/CSRF-boundary candidates at low request volume.
  - Returns `decision_state_observe_hint`.

## New references

- `skills/ctf-web/references/blackbox-first-pass.md`
- `skills/ctf-web/references/browser-runtime-admin-bot.md`
- `skills/ctf-web/references/parser-differential.md`
- `skills/ctf-web/references/authz-state-machine.md`
- `skills/ctf-web/references/source-leak-audit-bridge.md`
- `skills/ctf-web/references/ctf-web-pattern-index.md`

These references absorb method-level ideas from public CTF/security skills without copying their payload catalogs into the main prompt.

## Updated configuration

- `ctf-agent` and `ctf-web` permissions now allow:
  - `ctf-web-runtime-map`
  - `ctf-web-diff-probe`
  - `ctf-web-authz-matrix`
- `ctf-agent` and `ctf-web` prompts now mention the v8 black-box workflow.
- `commands/ctf.md`, `commands/ctf-web.md`, and `skills/ctf-web/SKILL.md` now require black-box application modeling before vulnerability-specific exploitation.

## Validation

- `opencode.jsonc` JSON parse: OK
- `npm run check` / `tsc --noEmit`: OK
