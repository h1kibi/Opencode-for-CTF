# Host Enumeration Matrix After a Web Foothold

Use after `ctf-web-host-enum` selects a platform. Prefer read-only, bounded checks and record only application-relevant results.

| Question | Linux | Windows | Container-specific interpretation |
|---|---|---|---|
| Identity | `id`, groups, effective UID | `whoami /all`, integrity level, groups | root in namespace may not be host root |
| Build | `/etc/os-release`, `uname -a` | `systeminfo`, build number | image/runtime version is not host kernel proof |
| Processes | `ps`, service manager, timers | `tasklist`, services, scheduled tasks | PID 1 and namespace visibility matter |
| Network | `ip addr`, `ip route`, `ss -lntup` | `ipconfig /all`, `route print`, `netstat -ano` | inspect routes, bridges, loopback and resolver view |
| Filesystem | mounts, Web root, configs, logs | IIS/app directories, ACLs, configs/logs | compare mounts and ownership to foothold |
| Scheduled work | cron/systemd timers | Task Scheduler/services | writable script/path is a candidate, not execution proof |
| Secrets | app configs/env/logs, metadata references | appsettings/web.config, service configs, task args | redact and validate one candidate only |

## Collection order

1. identity and build;
2. process/listener/network namespace;
3. application root and deployment metadata;
4. relevant configs/logs/jobs;
5. permissions and candidate boundaries;
6. one next discriminator.

## Negative evidence

Record absent/denied results too: no sudo policy, no service restart rights, no host mount, no listener, or no matching credential. Negative evidence prevents repeating broad searches.

