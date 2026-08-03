# Container, Kubernetes, and Cloud Boundary

Use after a Web foothold, SSRF, deployment leak, or runtime evidence indicates Docker, Kubernetes, cloud metadata, object storage, or a service-account boundary.

## Boundary order

1. **Process/container context**: UID/GID, PID 1, cgroups, namespaces, mounts, environment provenance, and network namespace.
2. **Application/deployment context**: compose/manifests, entrypoint, service account, mounted files, runtime socket, proxy, and backend names.
3. **Metadata/API context**: challenge-scoped metadata endpoint or Kubernetes API only when source/config/route evidence names it.
4. **Authority context**: token audience/issuer, namespace/resource scope, socket ACL, host mount permissions, and object-store policy.
5. **Closure context**: identify the smallest boundary that can read or return the challenge flag; do not equate root-in-container with host root.

## Key distinctions

- Runtime socket exposure is a candidate escape path; prove socket access and resulting host identity separately.
- A host filesystem mount is visibility, not write or execution authority.
- Cloud metadata reachability does not prove credential validity or role scope.
- A Kubernetes service-account token does not imply cluster-admin; validate identity and one relevant namespace/resource operation.
- `.env`, CI artifacts, and manifests may contain decoys or development credentials; preserve provenance and validate once.
- Object-storage read access, write access, and bucket administration are separate states.

## Safe workflow

Use one named endpoint/resource at a time, keep requests read-only, and stop after the first confirmed authority boundary. Record `origin -> boundary -> oracle -> impact`; hand off to internal recon, lateral movement, or privilege analysis as appropriate.
