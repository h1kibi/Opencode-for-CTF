# Web Reference Index

Use this file as the top-level trigger map for `skills/ctf-web/references/`. Keep the Web orchestrator thin and dispatch by phase and evidence.

## Recon / Mapping

- black-box first pass / safe route discovery
  - `blackbox-first-pass.md`
  - `v9-blackbox-toolchain.md`
  - `endpoint-calibration.md`

- source-first / audit bridge
  - `source-leak-audit-bridge.md`

- runtime / browser / admin-bot
  - `browser-runtime-admin-bot.md`

## Differential / Parser / State

- parser, path, content-type, semantic mismatch
  - `parser-differential.md`

- authz / workflow / object state
  - `authz-state-machine.md`

- control heuristics / direct-win pressure
  - `decision-gates.md`
  - `practical-patterns.md`
  - `scoreboard-speed-lane.md`

## Closure / Endgame

- primitive-to-flag routing
  - `web-closure-matrix.md`
  - `flag-recovery.md`

## Pattern / Historical Recall

- web pattern index / specialized pattern memory
  - `ctf-web-pattern-index.md`
  - `tool-family-fallback-matrix.md`
  - `rigorous-decision-optimizer.md`

## Specialized Niches

- staged CSS exfil
  - `css-staged-exfil.md`

- prototype pollution statefulness
  - `stateful-prototype-pollution.md`

## Trigger Rules

- If source or archive exists, use source-first references before payload-family expansion.
- If runtime/admin-bot/SPA clues dominate, route to browser/runtime references before payload mutation.
- If a primitive is already confirmed, switch to `web-closure-matrix.md` and `flag-recovery.md` before any new family.
- If a candidate feels CTF-shaped but the exact bypass family is unclear, use pattern/fallback references only after recon and attack-queue exist.

## Maintenance Rule

When adding a new Web reference, update this index with:

- trigger evidence
- owning phase
- whether it is recon, differential, closure, or historical-pattern support
