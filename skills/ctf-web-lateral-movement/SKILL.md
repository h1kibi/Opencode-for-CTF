---
name: ctf-web-lateral-movement
description: Use after a Web foothold or internal recon yields a validated credential, service token, trust relationship, or reachable second host in an authorized CTF/lab network and the solve requires one bounded pivot or service-to-service chain.
compatibility: opencode
---

# CTF Web Lateral Movement

Model lateral movement as an evidence chain, not a password spray or network sweep: `origin -> credential/primitive -> target -> protocol -> oracle -> closure`.

## Load When

Load when a Web foothold, SSRF, or local inventory provides both an in-scope target and a concrete access candidate, and one minimally invasive validation can distinguish usable access from a mere string or open port.

## Do Not Load When

Do not load for public Web exploitation, unvalidated credential guesses, broad subnet scanning, password spraying, persistence, or targets outside the written challenge scope. Do not replace `ctf-web-internal-recon` when the target is not yet identified.

## Required Inputs

Require origin context, target host/service/port, credential or primitive provenance, protocol, authorization basis, one success/failure oracle, and an attempt budget. Redact secrets in notes while retaining a stable fingerprint.

## First Safe Action

Validate one candidate against one explicitly in-scope target using the least-privileged read-only operation available: protocol handshake, authenticated identity query, or harmless resource listing.

## Dispatch / Handoff

- Return a successful identity/resource oracle to `ctf-web` and `ctf-web-exploit-chain`.
- If the target reveals a new internal service, return to `ctf-web-internal-recon` with the new origin.
- If access fails, mark the candidate invalid and return to `ctf-web-attack-queue`; do not mutate the credential or expand the target list.
- If the route becomes a native binary, disk/memory artifact, or crypto problem, pivot with the preserved evidence packet.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-web | ctf-web-internal-recon | ctf-web-exploit-chain
phase: control-plane | final-chain
origin: <foothold or internal service>
target: <host:port/service>
credential_fingerprint: <redacted stable id>
provenance: <file/config/response/source>
validation: unverified | validated-once | invalid
oracle: <identity or harmless resource evidence>
facts: []
uncertainties: []
strongest_signal: <one sentence>
next_action: <one bounded read-only action>
stop_reason: <required for blocked/dead/close>
```

## Stop Conditions

Stop after one target is validated or rejected, after the attempt budget is consumed, when the operation would change state, when secrets are not in scope, or when no evidence links the origin to the target. Never spray credentials or claim lateral compromise from a successful TCP handshake alone.

## Workflow

1. Fingerprint and scope the target.
2. Link candidate provenance to the origin and intended account/service.
3. Perform one read-only validation with a clear oracle.
4. Record target identity, permissions, and new evidence.
5. Either close the chain, return to internal recon, or mark the hypothesis dead.

## Common Service Branches

Use only when the service is already evidenced: SSH/WinRM/SMB/database/API/admin panel. Prefer identity/version/listing checks. Separate network reachability, protocol authentication, authorization, and flag/closure evidence into different ledger entries.

## Service validation matrix

Use `../ctf-web/references/internal-protocol-validation-matrix.md` when the candidate is a second service. Validate one target with a read-only identity or listing oracle and record protocol authentication separately from authorization. A successful TCP handshake or HTTP status difference is not lateral movement.

## Shared post-foothold evidence

Load `../ctf-web/references/post-foothold-evidence-contract.md` before promoting a pivot. A successful protocol handshake or identity response is not authorization, impact, or flag evidence.

## Credential and secret hygiene

Use `../ctf-web/references/foothold-secrets-minimization.md` when the candidate came from a Web root, environment, deployment file, log, or process argument. Preserve provenance, scope, and a redacted fingerprint; validate at most one candidate against one named target. Do not spray, reuse across unrelated hosts, or retain raw secrets in lessons.

## Closure handoff

A successful pivot still produces only a candidate flag until an independent oracle verifies the exact value. Return `origin -> credential/primitive -> target -> protocol -> oracle -> closure` to `ctf-web-exploit-chain` and use `ctf-evidence-board command=flag-verify` before finalization.

