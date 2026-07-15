---
description: Lock a Windows-hosted Linux ELF PWN challenge into one containerized runtime session
agent: ctf-master
subtask: true
---

Use this when the challenge is Linux ELF and you want one unified Docker-backed execution context before exploit iteration.

Input:
$ARGUMENTS

Workflow:
1. Run `ctf-pwn-linux-session` with `binary`, optional `libc`, optional `ld`, and optional remote host/port.
2. Save and report the emitted `runtime_profile_id` / `session_id`.
3. Reuse that same `runtimeProfileId` for `ctf-pwn-docker-runner`, `ctf-pwn-gdb-snapshot`, and `ctf-pwn-expect-runner mode=docker`.
4. Do not bounce back to host/WSL for the same Linux ELF branch unless the locked session is explicitly falsified.

Output contract:
```text
PWN_LINUX_SESSION
session_id:
runtime_profile_id:
session_path:
binary:
libc:
ld:
recommended_image:
recommended_service:
docker_runner_defaults:
explicit_loader_command:
```
