# Lateral Movement Evidence Ledger

Use with `ctf-web-lateral-movement`.

## Required chain

```text
origin foothold
  -> credential/primitive provenance
  -> target host and service
  -> protocol/authentication
  -> authorized identity/resource oracle
  -> new evidence or closure
```

A port open proves reachability only. A successful login proves authentication only. A readable resource or challenge state proves authorization/closure.

## Credential candidate record

```yaml
id: cred-<stable-redacted-id>
source: <config/log/env/response>
owner_or_account: <known or unknown>
format: <token/password/key/cookie>
scope: <service/host>
validation: unverified | validated-once | invalid
side_effects: none | <explicit>
```

## Pivot rules

- Validate one candidate on one named target.
- Use the least-privileged read-only operation.
- If it opens a new service, create a new origin and return to internal recon.
- Do not reuse a secret across unrelated targets without evidence of shared identity.
- Do not spray, brute-force, persist, or modify remote state.

