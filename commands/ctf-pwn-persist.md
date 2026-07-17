---
description: "PWN persistent container setup: keep common pwnlab services warm across sessions"
agent: ctf-master
subtask: false
---

Prepare a long-lived PWN Docker workspace so Linux ELF interaction, `gdb`, `pwntools`, `ROPgadget`, and remote debugging do not bounce back to the Windows host.

Context:
$ARGUMENTS

Rules:
- This is a preparation command, not an active solve command.
- Ask before pulling or building missing images.
- Prefer persistent compose services over repeated temporary `docker run` containers.
- Default persistent set: `pwn-general`, `pwn-general20`, `pwn-general24`, `pwn-debian12`, `pwn-alpine`.
- Optional persistent set: `pwn-general18`, `pwn-heavy`, `pwn-heavy24`, `pwn-aarch64`, `pwn-mipsel`, `pwn-i386`.

Checks:
0. Prefer `ctf-pwn-persist-probe` for a structured readiness check. Use `allowUp=false` first; ask before `allowUp=true`.

Recommended workflow:
1. Ensure templates are present in the challenge workspace with `templates/pwn_env_setup.ps1` if needed.
2. Start the chosen services with:
   - `docker compose -f docker/docker-compose.revlab.yml --profile general up -d pwn-general`
   - `docker compose -f docker/docker-compose.revlab.yml --profile general20 up -d pwn-general20`
   - `docker compose -f docker/docker-compose.revlab.yml --profile general24 up -d pwn-general24`
   - `docker compose -f docker/docker-compose.revlab.yml --profile debian12 up -d pwn-debian12`
   - `docker compose -f docker/docker-compose.revlab.yml --profile alpine up -d pwn-alpine`
3. Verify each service once with `ctf-pwn-container-probe`.
4. Keep PWN interaction tools on the same persistent service until the route or runtime is falsified.

Readiness target:
- `python3`, `pwntools`, `gdb`, `checksec`, `ROPgadget`, `readelf`, `objdump`, `nm`, and `strings` all present.
- Service remains up between solves.
- `ctf-pwn-docker-runner`, `ctf-pwn-gdb-snapshot`, and `ctf-pwn-expect-runner mode=docker` all use the same service by default.

Output contract:
```text
PWN_PERSIST
services_requested:
services_running:
services_missing:
probe_results:
recommended_default_service:
ask_before_build: yes/no
fast_mode_ready: yes/no
```
