---
description: Create or consume a bundled libc/ld runtime profile and keep later PWN tools on that runtime
agent: ctf-master
subtask: true
---

Use this when a PWN bundle contains `libc.so.6`, `ld.so.6`, `ld-linux*`, or when local/system libc observations may diverge from the intended challenge runtime.

Input:
$ARGUMENTS

Workflow:
1. Run `ctf-pwn-libc-runtime-doctor` with `binary`, `libc`, and `ld` when present.
2. Save and report the emitted `runtime_profile_id` and `runtime_profile_path`.
3. Use the reported `docker_runner_defaults` for later `ctf-pwn-docker-runner`, `ctf-pwn-gdb-snapshot`, `ctf-pwn-expect-runner mode=docker`, crash probes, and exploit iterations.
4. Use the reported `explicit_loader_command` or `explicit_loader_argv` inside exploit scripts when the challenge should run under bundled `ld`/`libc`.

Rules:
- Once a runtime profile exists, do not mix host/system-libc observations into exploit math unless the profile is explicitly falsified.
- Treat `binary-probe` host observations as triage only; runtime profile owns final loader/libc assumptions.
- If the profile selects a persistent service, verify it once with `ctf-pwn-container-probe` and keep using that service until unlock.

Output contract:
```text
PWN_RUNTIME_PROFILE
profile_id:
profile_path:
binary:
libc:
ld:
explicit_loader_command:
docker_runner_defaults:
unlock_condition:
```
