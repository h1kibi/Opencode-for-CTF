# Post-Foothold Evidence Contract

Use this reference after SSRF, server-side request, command execution, file read, deserialization, or a container foothold. It keeps Web post-exploitation claims separate from observations and prevents a reachable service, token-looking string, or root-like view from being promoted too early.

## Evidence chain

```text
origin -> execution_context -> asset -> protocol_ok -> authenticated -> authorized -> impact -> closure
```

Each edge is a separate ledger entry. A later edge cannot be inferred from an earlier one:

- TCP connect, timing, banner, or HTTP status proves at most `reachable`.
- A valid protocol response proves `protocol_ok`, not authentication or authorization.
- A credential/token must be validated against one named in-scope target.
- A root UID inside a container, readable `/root`/Administrator data, or a mounted socket is a lead; it is not host-level elevated execution.
- A successful command, decoded string, or file named `flag` is only candidate evidence until the shared Flag Oracle verifies it.

## Required observation tuple

Record each meaningful observation with:

```yaml
source: <HTTP response | terminal output | file path | tool>
origin: <foothold, process, namespace, or parent service>
subject: <user, service account, token, process, or artifact>
target: <host:port, path, service, container, or metadata endpoint>
namespace_or_boundary: <host/container/netns/IIS/AppPool/VM>
time: <timestamp>
method: <bounded read-only request or check>
result: <short response fingerprint, not raw secrets>
state: hinted | reachable | protocol_ok | authenticated | authorized | impact_confirmed | closure_candidate
confidence: low | medium | high
next_discriminator: <one falsifiable check>
```

Redact secrets while retaining a stable fingerprint and provenance. Do not copy raw cookies, private keys, tokens, or passwords into reusable notes.

## Platform boundary questions

- Linux: identity/groups, namespace and mounts, service owner, file ACL/write path, listener provenance, and whether the trigger actually runs as the claimed user.
- Windows: token/integrity level, service/task binary and directory ACLs, service identity, IIS/AppPool identity, and trigger/restart condition.
- Container/cloud: PID 1, cgroups/namespaces, host mounts, runtime socket, service-account scope, metadata audience, and whether the authority reaches the host or only the workload.
- Internal service: origin, resolver/network namespace, protocol, authentication, authorization, and closure relevance must be recorded separately.

## Handoff and stop rules

Handoff only the smallest packet: confirmed facts, rejected hypotheses, current state, one next probe, oracle, and stop condition. Mark `blocked` when the path remains plausible but the current boundary prevents progress; mark `dead` only after a differential or prerequisite check falsifies the family. Stop broad enumeration after one confirmed target is sufficient for the next phase.

Load `../../ctf-common/references/flag-candidate-oracle.md` before closure. `oracle_verified: true` is the only state that permits final Flag reporting or writing `agent_flag.txt`.
