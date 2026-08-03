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

## Runtime Flag Oracle

- strict candidate classification and independent proof
  - `../../ctf-common/references/flag-candidate-oracle.md`
  - runtime tool `ctf-flag-verify`
## Closure / Endgame
- primitive-to-flag routing
  - `web-closure-matrix.md`
  - `flag-recovery.md`

## Pattern / Historical Recall

- web pattern index / specialized pattern memory
  - `ctf-web-pattern-index.md`
  - `tool-family-fallback-matrix.md`
  - `rigorous-decision-optimizer.md`

## Host / Internal / Privilege Boundaries

- host inventory after Web foothold
  - `host-enum-matrix.md`
  - `../../ctf-web-host-enum/references/host-enum-playbook.md`

- internal services and post-foothold reachability
  - `internal-network-closure.md`
  - `../../ctf-web-internal-recon/references/internal-service-matrix.md`

- local privilege boundary ranking
  - `privesc-decision-matrix.md`
  - `../../ctf-web-privesc/references/local-privilege-boundary-playbook.md`
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

## Post-Foothold / Boundary Closure

- minimal secret and credential collection
  - `foothold-secrets-minimization.md`
- internal protocol, authentication, authorization, and closure distinction
  - `internal-protocol-validation-matrix.md`
- shared post-foothold evidence tuple and boundary state machine
  - `post-foothold-evidence-contract.md`
- Windows IIS/AppPool/service/task/token boundaries
  - `windows-iis-token-boundary.md`
- Docker/Kubernetes/cloud metadata/object-storage/CI boundaries
  - `container-k8s-cloud-boundary.md`

## Trigger Rules for New References

- Load `foothold-secrets-minimization.md` before reading broad application or deployment secrets.
- Load `internal-protocol-validation-matrix.md` before promoting an internal host/port to a usable service.
- Load `windows-iis-token-boundary.md` when the foothold is IIS/AppPool or a Windows service/task/token clue.
- Load `container-k8s-cloud-boundary.md` when a runtime socket, host mount, service-account token, metadata endpoint, object store, or CI artifact is in the evidence.
- Load `post-foothold-evidence-contract.md` whenever observations cross from reachability into protocol, identity, privilege, lateral, or closure claims.
- Keep all five references subordinate to the Web orchestrator; they do not create a new phase or final flag authority.
