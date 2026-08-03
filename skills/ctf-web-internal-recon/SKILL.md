---
name: ctf-web-internal-recon
description: Use after a Web foothold, SSRF, server-side request primitive, command execution, or file read exposes a reachable host/network boundary and the next task is authorized internal asset, service, metadata, or trust-boundary discovery.
compatibility: opencode
---

# CTF Web Internal Recon

Map the reachable internal boundary after a confirmed server-side primitive. Treat every host, port, metadata response, and trust relationship as a hypothesis until an observed response supports it.

## Load When

Load when Web evidence confirms SSRF, server-side fetch, a shell/command primitive, a readable local context, or a containerized service and internal discovery is the highest-value next step.

## Do Not Load When

Do not load for ordinary public Web recon, blind port scanning, or an unconfirmed SSRF guess. Do not use it to replace `ctf-web` phase ownership or to turn a single response into a claim of network compromise.

## Required Inputs

Require the confirmed primitive, authorized target roots/hosts, request method and response oracle, current network namespace/container context if known, an explicit low-noise probe budget, and the current evidence ledger.

## First Safe Action

Build an asset hypothesis table from source, configuration, DNS/hostnames, error messages, service URLs, route names, and already observed responses. Verify one high-value candidate with one bounded, read-only request; prefer a health/version/banner endpoint over a port sweep.

## Dispatch / Handoff

- Return confirmed reachability and service evidence to `ctf-web` and `ctf-web-attack-queue`.
- If the response exposes a local shell or host identity, hand off to `ctf-web-host-enum`.
- If a service accepts credentials or exposes a second challenge surface, preserve `origin -> target -> oracle` and hand off to `ctf-web-lateral-movement` only after the target is in scope.
- If the primitive is not reproducible, return `blocked` and do not broaden the scan.

## Output Contract

Return YAML-like state:

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-web | ctf-web-host-enum | ctf-web-lateral-movement
phase: control-plane | final-chain
facts: []
uncertainties: []
asset_candidates: []
confirmed_reachability: []
strongest_signal: <one sentence>
next_action: <one bounded read-only check>
stop_reason: <required for blocked/dead/close>
```

Record for each candidate: origin primitive, target identifier, protocol/port, request, response fingerprint, authorization basis, and whether the observation proves reachability or only a timeout/error difference.

## Stop Conditions

Stop when the budget is exhausted, the candidate is outside scope, responses are non-discriminating, the probe would cause state change, or one confirmed service is sufficient for the next solve phase. Never claim a subnet-wide map from a few successful requests.

## Workflow

1. Identify the execution context: host vs container, network namespace, proxy, DNS view, and service account.
2. Extract candidate assets from source/config/logs before guessing addresses.
3. Prefer one-by-one checks against known internal names, metadata endpoints, local Unix/TCP sockets, and challenge-described services.
4. Classify the oracle: status, length, timing, banner, structured error, or application-level response.
5. Promote only reproducible observations into the evidence ledger.
6. Stop and hand off when the next useful question is local host state, credentials, or a second service.

## Protocol validation gate

Before calling an internal service usable, load `../ctf-web/references/internal-protocol-validation-matrix.md`. Record these as separate states: `reachable`, `protocol_ok`, `authenticated`, `authorized`, and `closure_relevant`. A banner, timing difference, or open TCP connection is not authentication or authorization. Prefer one named health/version/identity/listing request over a port sweep.

## Shared post-foothold evidence

Load `../ctf-web/references/post-foothold-evidence-contract.md`. Keep `origin -> asset -> protocol_ok -> authenticated -> authorized -> closure` as separate ledger edges and attach one falsifiable discriminator to every candidate.

## Metadata and orchestration boundary

When the candidate is Docker, Kubernetes, cloud metadata, object storage, or CI/deployment, load `../ctf-web/references/container-k8s-cloud-boundary.md` and preserve the network namespace and origin primitive. Promote a token, socket, mount, or metadata response only after its authority scope is observed.
