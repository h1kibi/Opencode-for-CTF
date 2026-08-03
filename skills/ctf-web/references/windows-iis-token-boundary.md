# Windows IIS, AppPool, and Token Boundary

Use after a Windows Web foothold or IIS evidence. Separate the web process identity, application-pool token, service account, and local administrator boundary.

## Evidence passes

1. Record `whoami /all`, integrity level, groups, hostname, build, current directory, and parent process.
2. Identify IIS site/app-pool mapping, worker process identity, config inheritance, and application root.
3. Check ACLs only on challenge-relevant application, service, task, upload, log, and configuration paths.
4. Rank one boundary: writable service/task binary or argument, weak IIS/app-pool config, impersonation/token privilege, credentialed service, or scheduled trigger.

## Boundary distinctions

- `IIS APPPOOL\\Name` is an application-pool identity, not local administrator.
- `SeImpersonatePrivilege`/`SeAssignPrimaryTokenPrivilege` is a lead; it requires a concrete local token/impersonation oracle and exact runtime prerequisites.
- A readable `web.config` or connection string proves disclosure only; validate a named service/account once.
- A writable upload or web root proves file write only; prove execution and resulting identity separately.
- A service binary is exploitable only when the foothold can alter the executed path/arguments and a restart/trigger is evidenced.

## Low-noise checks

Prefer identity/build, IIS/site configuration, process owner, service/task metadata, and ACL checks. Avoid broad registry export, credential harvesting, persistence, or token theft. If a candidate requires a high-risk impersonation technique, stop and return prerequisites rather than guessing payloads.

## Handoff fields

```yaml
web_identity: <account/integrity>
iis_site_or_pool: <name>
candidate_boundary: <service|task|acl|token|config|credential>
prerequisites: []
confirmation_oracle: <identity/ACL/service result>
impact: disclosure | user_switch | elevated_execution | lateral_access
```
