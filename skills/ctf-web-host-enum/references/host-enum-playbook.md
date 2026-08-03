# Host Enumeration Playbook

Use after `ctf-web-host-enum` confirms a server-side read/execute context. This is a bounded question set, not a recursive filesystem or secret-dumping recipe.

## Evidence model

Record each observation as one of:

- `context`: identity, OS/build, namespace, working directory, service account;
- `visibility`: process, mount, route, listener, resolver, application root;
- `boundary`: ownership/ACL, writable path, scheduled trigger, service identity, token/capability;
- `candidate`: possible credential, endpoint, or flag source that still needs validation;
- `oracle`: reproducible identity, authorization, file, service, or challenge-state result.

A process visible to the Web user is not necessarily controllable. A readable configuration value is not a validated credential. A root UID in a container is not host-root evidence.

## Collection passes

### Pass A — execution context

Answer only the facts needed to choose the next branch:

| Question | Linux | Windows | Container note |
|---|---|---|---|
| Identity | `id`, groups, effective UID | `whoami /all`, integrity level, groups | record namespace identity separately |
| Build | `/etc/os-release`, `uname -a` | `systeminfo`, build number | image version is not host-kernel proof |
| Location | `pwd`, Web root, mounts | current directory, IIS/app root | capture bind mounts and working directory |
| Runtime | parent/child process, environment | process owner, service/app-pool identity | identify PID 1 and namespace visibility |

### Pass B — application and trust boundary

Inspect only challenge-relevant locations discovered from source, deployment files, process arguments, or service metadata:

- application configs, environment files, logs, job definitions, and deployment manifests;
- process arguments and service definitions that reveal backend endpoints or identities;
- ownership/ACLs on files, directories, scripts, sockets, and service paths;
- mounts, routes, loopback listeners, resolver configuration, and proxy variables;
- container runtime sockets, host mounts, metadata references, and orchestration hints.

Do not recursively search the entire filesystem before a candidate has been ranked.

### Pass C — one discriminator

Choose one action based on the strongest signal:

- local permission boundary -> `ctf-web-privesc`;
- validated credential plus named service -> `ctf-web-lateral-movement`;
- reachable internal service -> `ctf-web-internal-recon`;
- explicit flag source -> `ctf-web` closure and the shared Flag Identification Rules.

## Credential handling

For every credential candidate retain:

```yaml
source: <path/config/response/process argument>
owner_or_acl: <relevant access evidence>
format: <password/token/key/cookie/connection string>
scope: <intended user/service/host>
validation: unverified | validated-once | invalid | redacted
fingerprint: <stable non-secret identifier>
```

Validate at most one candidate against one explicitly in-scope target using a read-only identity or listing oracle. Never label a string as a credential merely because it resembles a password, JWT, hash, or connection string.

## Flag closure

If a file or command output contains a flag-shaped value, preserve `source`, `origin`, and `context`. Apply `ctf-common/references/flag-candidate-oracle.md` and the strict identification rules: a candidate is not an accepted solution until an ctf-flag-verify reports oracle_verified: true from an independent exact/file/service oracle. A bare hash needs explicit flag-file or flag-helper context.

## Stop conditions

Stop when the platform, identity, relevant application roots, network boundary, and one next discriminator are known; when the read/execute oracle becomes unstable; when collection would exceed scope; or when new searches are no longer changing the decision.

