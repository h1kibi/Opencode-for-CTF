# Internal Network and Post-Foothold Closure

Source provenance: synthesized from the local Web skill contract. Retrieve deeper technique context with `ctf_rag` using the concrete sink/oracle/protocol anchors of the current target. Keep this as a decision reference, not a blind scanning recipe.

## Evidence ladder

1. **Primitive**: reproducible SSRF, command/read primitive, or server-side execution.
2. **Context**: host/container identity, network namespace, service account, proxy/DNS view.
3. **Reachability**: one target and one protocol response; a timeout difference is only a weak signal.
4. **Service identity**: banner, structured health response, version, or authenticated identity.
5. **Authorization**: the tested identity can read/list/use a resource.
6. **Closure**: flag, challenge state, or explicit elevated boundary is recovered and independently verified.

Do not skip from step 1 to “internal network compromised.”

## Candidate extraction before probing

Prefer candidate names and addresses from:

- source route/config files, environment variables, compose/manifests, service discovery, error messages;
- WebSocket/API backends, callbacks, webhook destinations, database/cache URLs;
- container mounts, `/etc/hosts`, resolver configuration, route table, and already observed hostnames;
- cloud metadata or orchestration endpoints only when the challenge explicitly places them in scope.

Keep an asset table with `candidate`, `source`, `protocol`, `expected oracle`, `scope`, and `status`.

## Low-noise probe order

1. same-host documented health/version endpoint;
2. one known internal hostname/service from source;
3. one local metadata or orchestrator endpoint when environment evidence supports it;
4. one port/service discriminator on a named target;
5. stop, hand off, or update the hypothesis.

Avoid unordered port sweeps, high concurrency, repeated callback attempts, and state-changing admin endpoints.

## Container/cloud boundary questions

- Is the process root inside a container or host namespace?
- Are host paths mounted, and are they read-only or writable?
- Is a runtime socket present, and what identity/permissions does it have?
- Does metadata return an identity/token, or only a generic error?
- Is an internal API reachable but unauthenticated, or merely exposed?

A container root UID, metadata response, or runtime socket is a lead. Require a separate oracle for any boundary crossing.

## Handoff packet

```yaml
origin: <primitive/context>
candidate: <host/service>
probe: <method and endpoint class>
response_fingerprint: <status/length/banner/structured field>
proves: primitive | context | reachability | service_identity | authorization | closure
scope_basis: <challenge statement/lab root>
next_owner: <skill>
```

