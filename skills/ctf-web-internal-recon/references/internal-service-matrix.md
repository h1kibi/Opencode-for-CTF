# Internal Service Decision Matrix

Use after `ctf-web-internal-recon` has a confirmed server-side primitive. Select a named candidate from source/config/runtime evidence before probing. This matrix favors identity and authorization checks over scanning.

| Surface | Candidate source | First low-noise oracle | What it proves | Next owner |
|---|---|---|---|---|
| Internal HTTP/admin API | backend URL, route, error, service discovery | documented health/version or harmless GET | reachability/service identity | `ctf-web` or closure |
| Redis/cache | connection string, localhost listener, framework config | protocol ping or harmless metadata where challenge permits | protocol availability, not write access | `ctf-web-lateral-movement` |
| SQL/NoSQL service | ORM/DSN/config, named listener | authenticated identity or read-only schema/listing | authentication and authorization separately | `ctf-web-lateral-movement` |
| Docker/runtime socket | mount list, environment, deployment manifest | socket existence/permissions and runtime identity | local boundary lead, not host escape | `ctf-web-host-enum` / privesc |
| Kubernetes metadata/API | pod env, service account mount, cluster config | metadata identity or bounded API discovery | identity/reachability, not cluster control | cloud/control-plane skill |
| SSH/WinRM/SMB | validated credential, service config, host inventory | handshake plus identity/listing | protocol auth and resource access | `ctf-web-lateral-movement` |
| Metrics/debug/CI | route/source/config, deployment exposure | read-only page or artifact listing | information exposure and possible next source | `ctf-web` |
| File share/object store | manifest, SDK config, bucket/share reference | one scoped listing/read | authorization on one resource | `ctf-web-lateral-movement` |

## Evidence ladder

Keep these states separate:

```text
primitive
  -> execution context
  -> target reachability
  -> service identity
  -> authentication
  -> authorization
  -> closure
```

A timeout difference is weak reachability evidence. A banner is not authorization. A successful login is not administrative access. An internal service is not a flag until the flag source and oracle are independently verified.

## Probe budget

Before each probe record:

```yaml
candidate: <host/service>
source: <where it was learned>
protocol: <http/redis/sql/ssh/etc>
scope_basis: <challenge/lab scope>
request: <one bounded action>
expected_oracle: <status/banner/identity/listing>
side_effect_risk: none | reversible | state-changing
```

Prefer one candidate at a time. Avoid unordered port sweeps, password spraying, repeated callback attempts, writes to caches/databases, and administrative mutations unless explicitly required by the challenge.

## Closure routing

- Read-only internal response with no new privilege: return to `ctf-web` with the evidence packet.
- Validated service credential: hand off to `ctf-web-lateral-movement`.
- Local socket, host mount, or runtime permission boundary: hand off to `ctf-web-host-enum`/`ctf-web-privesc`.
- Explicit flag source: apply shared Flag Identification Rules and stop broad recon after oracle verification.

