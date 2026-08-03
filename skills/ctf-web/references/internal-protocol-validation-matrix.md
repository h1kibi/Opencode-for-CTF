# Internal Protocol Validation Matrix

Use after `ctf-web-internal-recon` has a named in-scope service candidate. This is a validation matrix, not a port-scanning recipe.

| Protocol/surface | First bounded oracle | Proves | Does not prove | Next step |
|---|---|---|---|---|
| HTTP/admin API | fixed health/version or harmless GET | service identity and reachability | authorization or flag access | map auth/routes |
| Redis/cache | protocol ping or read-only info allowed by challenge | protocol response | write/admin authority | validate named key or pivot |
| SQL/NoSQL | authenticated identity or read-only schema/listing | auth and initial authorization | arbitrary query/write | use application DSN/source |
| SSH/WinRM | one credentialed identity check | protocol auth and account | admin/root privilege | enumerate allowed scope |
| SMB/NFS | share/listing query with named share | share access | write/execute rights | test one relevant path |
| Docker/runtime socket | socket metadata/API version | socket exposure | host escape | inspect mounts/permissions |
| Kubernetes API | service-account identity or namespace listing | token scope and API reachability | cluster-admin or host access | inspect only named resources |
| Object storage | bucket/object metadata or challenge-local listing | bucket/object access | write/delete authority | retrieve one relevant object |

Record separately: `reachable`, `protocol_ok`, `authenticated`, `authorized`, `closure_relevant`. A timeout, status-code difference, or banner alone must not be promoted to authenticated access.

## Probe rules

- Start from source/config/route evidence; do not guess a subnet.
- Prefer one request per candidate and fixed small target lists.
- Use read-only identity, version, health, or listing operations.
- Stop after a confirmed service is enough to select the next owner.
- Preserve the origin primitive and network namespace for every result.
