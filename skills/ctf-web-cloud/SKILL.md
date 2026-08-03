---
name: ctf-web-cloud
description: Use when Web CTF evidence mentions Docker, Kubernetes, k8s, metadata service, .env, health/metrics/debug, CI artifacts, object storage, subdomain takeover, webhook secrets, or deployment exposure.
compatibility: opencode
---

# CTF Web Cloud, Container, and Deployment Boundaries

Treat deployment exposure as a boundary-analysis problem: `origin -> boundary -> authority -> oracle -> closure`. A metadata response, root UID, mounted socket, or token-looking value is only a candidate until its scope and effect are verified.

## Load When

Load after `ctf-web` focused-probe identifies Docker/Kubernetes/cloud/deployment evidence, or after a Web foothold/SSRF exposes a named runtime, metadata endpoint, object store, CI system, or service-account boundary.

## Do Not Load When

Do not load for generic Web recon, an unconfirmed cloud guess, broad metadata/port scanning, credential spraying, bucket writes, persistence, or targets outside the challenge scope. Do not replace `ctf-web-internal-recon`, `ctf-web-host-enum`, or `ctf-web-privesc` when one of those owns the next question.

## Required Inputs

Require the observed deployment signal, origin primitive, target/scope, current Web phase, a bounded probe budget, and one success oracle. Preserve whether the observation came from source, config, runtime, HTTP, or an internal service.

## First Safe Action

Classify the boundary read-only before touching payloads:

1. Process/container: identity, PID 1, cgroup, namespace, mounts, network namespace.
2. Deployment: compose/manifests, entrypoint, service account, mounted files, socket/proxy, backend names.
3. Authority: token audience/issuer, namespace/resource scope, socket ACL, mount permissions, object-store policy.
4. Closure: the smallest named resource or service that can return the challenge flag.

Load `../ctf-web/references/container-k8s-cloud-boundary.md` for the matching boundary family.

## Dispatch / Handoff

- Runtime/socket/mount/metadata evidence with no host identity: return to `ctf-web-internal-recon`.
- Local identity, ACL, scheduled task, or service boundary: hand off to `ctf-web-host-enum` / `ctf-web-privesc`.
- A validated token/credential plus named service: hand off to `ctf-web-lateral-movement`.
- A confirmed flag-returning route/resource: hand off to `ctf-web-exploit-chain` and `ctf-closure-gate`.
- Return to `ctf-web` / `ctf-web-attack-queue` if the signal is falsified or no authority boundary is established.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-web | ctf-web-internal-recon | ctf-web-host-enum | ctf-web-privesc | ctf-web-lateral-movement | ctf-web-exploit-chain
phase: focused-probe | control-plane | final-chain
origin: <source/SSRF/foothold/service>
boundary: container | runtime-socket | host-mount | metadata | kubernetes | object-storage | ci-cd | deployment | unknown
facts: []
uncertainties: []
authority: reachable | protocol_ok | authenticated | authorized | closure_relevant | none
oracle: <one observed identity/ACL/resource/flag result>
strongest_signal: <one sentence>
next_action: <one bounded read-only check>
stop_reason: <required for blocked/dead/close>
```

## Boundary-specific checks

- **Docker/runtime**: prove socket access, API identity, and resulting host/container identity separately. A socket path or host mount alone is not escape proof.
- **Kubernetes**: validate service-account identity and one named namespace/resource operation. Do not infer cluster-admin from token presence.
- **Cloud metadata**: use only challenge-named metadata paths; distinguish endpoint reachability, credential retrieval, role scope, and resource authorization.
- **Object storage**: separate bucket/object read, write, delete, and administration. Prefer one challenge-relevant object.
- **CI/deployment**: inspect provenance, job scope, artifact ownership, and whether a secret is live; development values and sample artifacts are decoys until runtime-linked.
- **Health/debug/metrics**: treat disclosure as a source of candidate routes, backend names, or secrets; validate the next boundary instead of dumping all output.

## Stop Conditions

Stop when one boundary is confirmed or falsified, the oracle is non-discriminating, the budget is exhausted, the action would mutate unrelated state, or the next useful question belongs to another owner. Never claim host compromise, cluster-admin, cloud-role authority, or a verified flag from a single response.
