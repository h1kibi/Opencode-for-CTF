---
name: ctf-web-host-enum
description: Use after a Web shell, command execution, file read, deserialization primitive, or container foothold is confirmed and you need a low-noise local Linux, Windows, or container host inventory before privilege escalation or lateral movement.
compatibility: opencode
---

# CTF Web Foothold Host Enumeration

Perform read-only local enumeration that converts a Web foothold into a bounded host and trust-boundary model. Do not confuse visibility with privilege or a discovered string with a usable credential.

## Load When

Load after a reproducible server-side execution or equivalent local read primitive exposes a host/container context and the next decision depends on OS, identity, process, service, filesystem, or network facts.

## Do Not Load When

Do not load for a pure client-side Web bug, an unconfirmed command injection, or broad post-exploitation without a challenge scope. Do not dump secrets, alter persistence, or execute a privilege-escalation payload during inventory.

## Required Inputs

Require the foothold type and command/read oracle, target scope, execution user, current Web phase, platform hypothesis, and a bounded list of questions to answer. Preserve command output with timestamps and avoid collecting unrelated personal data.

## First Safe Action

Run the smallest identity/context set appropriate to the platform: effective user and groups, OS/kernel/build, current working directory, process environment, and network namespace. Use one command at a time when the oracle is fragile.

## Dispatch / Handoff

- Send the inventory to `ctf-web` and `ctf-web-attack-queue`.
- If a local permission boundary or risky service is identified, load `ctf-web-privesc`.
- If in-scope credentials/config references and a reachable second service are both confirmed, load `ctf-web-lateral-movement`.
- If no local execution remains and only an HTTP service is reachable, return to the Web exploit chain.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-web | ctf-web-privesc | ctf-web-lateral-movement
phase: control-plane | final-chain
facts: []
uncertainties: []
identity: {user: null, groups: [], integrity_or_uid: null}
platform: {os: null, version: null, kernel_or_build: null, container: unknown}
process_and_services: []
network: {interfaces: [], routes: [], listeners: [], dns: []}
interesting_paths: []
credential_candidates: []
strongest_signal: <one sentence>
next_action: <one bounded read-only check>
stop_reason: <required for blocked/dead/close>
```

Credential candidates must include source path, owner/permissions, format, scope, and validation status (`unverified`, `validated-once`, `invalid`, `redacted`). Never report a candidate as a credential without an oracle-backed validation.

## Stop Conditions

Stop when identity, platform, process/service, network, and relevant application-path questions are answered; when the command/read oracle is unstable; when collection would cross scope; or when a single candidate is enough to choose the next phase. Do not continue with recursive filesystem searches after the evidence stops changing.

## Workflow

1. Identify OS and privilege boundary.
2. Record processes, listeners, routes, mounts, namespaces, scheduled work, and service managers.
3. Locate only application-relevant roots: Web root, deployment files, environment/config files, logs, job definitions, and source/build metadata.
4. Compare file ownership and write permissions against the foothold identity.
5. Separate facts, candidate secrets, and hypotheses.
6. Return the smallest next discriminator: a permission check for `ctf-web-privesc`, or one service/credential validation for lateral movement.

## Platform Checklist

- Linux: `id`, `uname -a`, `/etc/os-release`, `ps`, `ss`/`netstat`, `ip addr`/`ip route`, mounts/namespaces, `sudo -l` only when allowed, service/timer/cron locations, SUID/capability candidates, application configs and logs.
- Windows: `whoami /all`, `systeminfo`, `hostname`, `ipconfig /all`, `route print`, `tasklist`, `netstat -ano`, services/tasks, application directories, IIS/ASP.NET configs, and ACLs on relevant files/services.
- Container: `/proc/1/cgroup`, mounts, namespace identity, container runtime/socket presence, environment/config provenance, and the boundary to the host. Treat a runtime socket or host mount as a lead, not automatic escape.

## Shared post-foothold evidence

Load `../ctf-web/references/post-foothold-evidence-contract.md` and record each host, service, identity, namespace, and credential observation as a separate state transition. Reachability, visibility, and a root-looking view are not privilege or closure proof.

## Minimal secrets and application provenance

After identity and boundary facts, collect only challenge-relevant configuration, process arguments, deployment manifests, logs, and mounted secret metadata. Load `../ctf-web/references/foothold-secrets-minimization.md` for candidate recording and one-target validation. Redact values in notes and retain a stable fingerprint. A readable secret-looking string is not a validated credential.

## Windows and container handoff

For IIS or Windows footholds, preserve worker-process/app-pool identity, integrity level, ACL evidence, service/task trigger, and token privileges; load `../ctf-web/references/windows-iis-token-boundary.md` before choosing a privilege hypothesis. For Docker/Kubernetes/cloud clues, preserve PID 1, cgroups, namespaces, mounts, runtime sockets, service-account provenance, and metadata scope; load `../ctf-web/references/container-k8s-cloud-boundary.md`. Root inside a container is not host-root evidence.

## Flag source discipline

If a relevant file or command returns a flag-shaped value, record source, origin, and context and hand it to the shared Flag Identification Rules. Do not write `agent_flag.txt` or call it solved until `ctf-evidence-board command=flag-verify` (or an independent challenge oracle) accepts the exact value.

