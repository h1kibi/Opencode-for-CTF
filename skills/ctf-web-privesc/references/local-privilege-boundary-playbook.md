# Local Privilege Boundary Playbook

Use with `ctf-web-privesc` after host enumeration identifies a concrete candidate. Rank by proof, trigger, reversibility, and closure value. Do not load a generic exploit catalogue.

## Candidate proof table

| Class | Required proof before a trigger | Common false positive | Safe success oracle |
|---|---|---|---|
| `sudo`/policy | exact rule, executable, arguments, environment, invoking identity | command is allowed only without useful control | before/after identity or controlled challenge file read |
| SUID/SGID | reachable binary, owner, behavior, controllable input | setuid bit exists but no controllable path | controlled identity/output oracle |
| File capability | capability and binary behavior both observed | capability is present but unused | capability-relevant controlled output |
| cron/systemd/task | writable script/config/path and known trigger identity | writable directory is not used by the job | scheduled controlled output or identity |
| Service path/config | service identity, restart/trigger, writable component | process is writable-looking but not restartable | service-owned controlled output |
| Windows token | privilege present on current token and usable local boundary | token privilege exists but is disabled/irrelevant | integrity/identity or controlled output |
| Windows service/task | executable/script ACL plus execution identity and trigger | service exists but foothold cannot alter its inputs | service-owned controlled output |
| Container boundary | host mount/socket/namespace and permissions | container root mistaken for host root | explicit host-side identity/file oracle |
| Kernel/runtime issue | exact version/build and prerequisites | version guess or unrelated CVE | reproducible isolated elevated identity |

## Platform-specific discriminators

### Linux

Prioritize in this order when evidence exists:

1. `sudo` rules and command argument/environment boundaries;
2. writable service, timer, cron script, unit, or deployment path;
3. SUID/SGID and file capabilities whose behavior is understood;
4. credentials tied to a named local service or user switch;
5. container socket/mount/namespace boundary;
6. exact kernel/runtime match only after cheaper candidates are falsified.

Check ownership, ACLs, trigger conditions, and execution identity separately. `can write` does not mean `will execute`; a writable parent directory does not prove the target file can be replaced safely.

### Windows

Prioritize evidence for:

1. service/task executable and argument ACLs;
2. service identity and restart/trigger conditions;
3. token integrity and impersonation-related privileges;
4. IIS/application-pool identity and configuration boundaries;
5. registry/startup or installer policy with relevant ACL and trigger;
6. exact build-specific runtime/kernel path.

Separate `whoami /all` visibility from actual use of a privilege. Record the service/task account, binary path, writable path segment, trigger, and cleanup requirement before any controlled action.

### Container and orchestration

Treat the following as leads requiring a second oracle:

- runtime socket presence;
- host filesystem mount;
- privileged namespace or extra capabilities;
- service-account token or metadata identity;
- writable deployment/CI artifact.

Do not claim host compromise from container UID 0, a metadata error, or a socket path alone.

## Verification and closure

Before a controlled trigger record:

```yaml
before_identity: <uid/integrity/user>
candidate: <class/path/service>
trigger: <bounded action>
expected_oracle: <identity/file/challenge state>
side_effects: <none/reversible/required>
cleanup: <action or not needed>
```

Afterward record the exact result. A readable `/root`, Administrator directory, or configuration file may be useful evidence but is not automatically proof of elevated execution. Once the flag source is reached, use the shared Flag Identification Rules and require oracle verification before finalizing.

