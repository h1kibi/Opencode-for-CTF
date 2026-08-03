# Foothold Secrets and Credential Minimization

Use after a Web foothold, file-read primitive, or deployment leak exposes application-local configuration. The goal is to answer one next-step question without turning enumeration into indiscriminate secret dumping.

## Collection order

1. Identify the current identity, process, working directory, namespace, and application root.
2. Derive candidate locations from source, process arguments, deployment manifests, framework config loaders, and error paths.
3. Read the smallest relevant file or field; redact values in notes and retain a stable fingerprint.
4. Rank each candidate by source, intended scope, permissions, format, and validation status.
5. Validate at most one candidate against one explicitly in-scope target with a read-only identity or listing oracle.

## Candidate record

```yaml
source: <file/config/response/process-argument>
owner_or_acl: <access evidence>
format: password | token | cookie | key | connection-string | hash | unknown
scope: <user/service/host>
validation: unverified | validated-once | invalid | redacted
fingerprint: <non-secret stable identifier>
```

A JWT, hash, API key-looking string, or environment variable is a candidate, not a usable credential. Do not replay cookies or tokens to unrelated hosts. Do not expand to home-directory, browser-profile, or whole-filesystem collection unless the challenge explicitly makes that path the intended objective.

## Branch discriminators

- Application config names a backend: validate the named service, not every port.
- Deployment manifest names a service account or mounted secret: inspect mount/ACL provenance and the consuming process.
- Token contains an audience/issuer: compare it to the target service before validation.
- Password is reused in source/config: test one named account or service only; record failure and stop reuse attempts.
- Candidate is a bare hash: keep it as a hash unless explicit flag-file/helper context exists.

## Handoff

Return `origin -> candidate -> target -> oracle -> result` to `ctf-web-lateral-movement` or `ctf-web-privesc`. If the candidate is not needed for the next decision, discard the value and retain only its fingerprint.
