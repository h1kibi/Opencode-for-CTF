---
name: ctf-web-privesc
description: Use after a Web foothold or server-side execution is confirmed and host enumeration reveals a privilege boundary, writable path, dangerous service, scheduled task, capability, or runtime misconfiguration requiring authorized local analysis.
compatibility: opencode
---

# CTF Web Local Privilege Analysis

Turn host-enumeration facts into one falsifiable privilege hypothesis at a time. Prioritize low-impact confirmation and distinguish file-read, service access, user switch, container boundary crossing, and true elevated code execution.

## Load When

Load when `ctf-web-host-enum` has identified a concrete local boundary or candidate such as sudo policy, SUID/capability, writable service/task path, credentialed service account, kernel/container misconfiguration, or Windows service/token weakness.

## Do Not Load When

Do not load from a generic shell without an inventory, for a purely remote Web authorization bug, or to run a large exploit catalogue. Do not use kernel exploits or persistence unless the challenge explicitly requires them and the target is isolated and authorized.

## Required Inputs

Require the foothold identity, OS/build, candidate path or service, ownership/ACL evidence, execution context, impact budget, and a clear success oracle (UID/integrity, readable flag, or challenge state).

## First Safe Action

Choose the highest-scoring candidate by evidence, impact, reversibility, and cost. Re-check its permission/ownership/argument boundary with a read-only command before attempting any controlled trigger.

## Dispatch / Handoff

- Return the confirmed boundary or falsified candidate to `ctf-web` and `ctf-web-host-enum`.
- If a higher local identity or flag-readable boundary is confirmed, hand off to `ctf-web-exploit-chain` for closure.
- If the candidate yields a valid credential or access to another in-scope service, hand off to `ctf-web-lateral-movement`.
- If all candidates are weak or environment-dependent, return `dead` with the tested evidence rather than escalating blindly.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-web | ctf-web-exploit-chain | ctf-web-lateral-movement
phase: control-plane | final-chain
facts: []
uncertainties: []
candidate: {class: null, path_or_service: null, owner: null, writable_by_foothold: false}
confirmation: {method: null, before: null, after: null, oracle: null}
impact: file_read | service_access | user_switch | elevated_execution | container_boundary | flag
strongest_signal: <one sentence>
next_action: <one bounded confirmation>
stop_reason: <required for blocked/dead/close>
```

## Stop Conditions

Stop after one candidate is confirmed, falsified, or reaches the attempt budget; when a trigger would mutate unrelated state; when the target is outside scope; or when a kernel/runtime exploit is the only path but its prerequisites are not established. Do not chain speculative candidates without returning to the ledger.

## Decision Matrix

- Linux: sudo rule -> executable and environment boundary; SUID/SGID -> reachable controlled input; file capability -> permitted capability actually used by the binary; cron/systemd -> writable script/config and schedule; writable service binary/path -> service identity and restart condition; container -> mount/socket/namespace and explicit boundary evidence.
- Windows: service/task -> binary/script ACL and execution identity; unquoted path -> writable path segment plus restart/trigger; token/impersonation -> token privilege and safe local oracle; registry/startup -> relevant ACL and trigger; IIS/app pool -> identity and config boundary.
- Cross-platform: credentials -> source and permissions first, single-target validation second; kernel/CVE -> exact build match and isolated reproducibility before use.

## Verification Rules

Record before/after identity, exact trigger, output oracle, side effects, and cleanup. A readable `/root`/Administrator path is not itself proof of elevated execution; a container root UID is not automatically host root.

## Shared post-foothold evidence

Load `../ctf-web/references/post-foothold-evidence-contract.md` and record the before/after identity, execution boundary, trigger, and oracle as separate evidence. Container root or readable privileged data alone does not prove host-level escalation.

## Linux, Windows, and container boundary references

Load `../ctf-web/references/windows-iis-token-boundary.md` for IIS/AppPool, service/task ACL, integrity-level, or impersonation clues. Load `../ctf-web/references/container-k8s-cloud-boundary.md` for runtime sockets, host mounts, Kubernetes service accounts, or metadata. In both cases, require a concrete before/after identity or authority oracle; a privilege-looking bit, root UID, or readable file is not elevated execution.

## Candidate ordering

Prefer, in order: directly evidenced writable trigger with known execution identity; named service/task/config boundary; validated credentialed service; capability/token boundary with exact prerequisites; exact-build kernel/runtime issue. Do not jump to a kernel or impersonation technique while lower-cost ownership and trigger questions remain unanswered.

