---
description: CTF PWN: One-shot bootstrap for Linux ELF substrate lock, pwnlab setup, and first probe plan
agent: ctf-pwn
subtask: true
---

Use this command at the start of a Linux ELF PWN challenge or after a failed Windows/WSL/Docker drift episode.

Challenge/workspace context:
$ARGUMENTS

### Bootstrap Contract

Perform exactly one environment/bootstrap pass before exploit analysis expands:

1. Identify artifacts: ELF, libc, ld, Dockerfile/compose, source, run script, remote host/port, flag format.
2. On Windows, run a real host probe before any “host lacks ELF tools” claim:

```powershell
Get-Command file, readelf, objdump, nm, strings, checksec -ErrorAction SilentlyContinue
```

3. If host tools exist, do a host-only triage pass first:
   - `file <binary>`
   - `readelf -h <binary>`
   - `objdump -f <binary>`
   - `nm -an <binary>`
   - `strings -a <binary>`
   - `checksec --file=<binary>`
4. Run or request `ctf-pwn-docker-harness` for the challenge directory when runtime alignment or deeper tooling is needed.
5. Choose and lock one main substrate:
   - `host-triage-first` if host ELF tools exist and the current need is read-only triage;
   - `challenge-docker` if challenge Docker/compose is present and runnable;
   - otherwise `pwnlab-docker` using the closest pwnlab profile;
   - otherwise `fallback-wsl` only with an explicit blocker for Docker.
6. Record `PWN_ENV_LOCK`:

```text
PWN_ENV_LOCK
host_probe_result: present | partial | missing
active_substrate: SUBSTRATE_WINDOWS_PS | SUBSTRATE_DOCKER | SUBSTRATE_WSL
runtime_owner: host-triage-first | challenge-docker | pwnlab-docker | fallback-wsl
image:
service:
profile:
mount: ./:/work
workdir: /work
tool_health: file/readelf/objdump/nm/strings/gdb/python3/pwntools/checksec
host_triage_commands:
unlock_condition:
next_probe:
```

7. If no pwnlab files exist, use:

```powershell
& "C:\Users\Administrator\.config\opencode\templates\pwn_env_setup.ps1" -TargetDir . -Profile 22
```

8. Build only after asking if the image may need pulling or significant disk/time.

### Route Discipline Coupling

After bootstrap, any confirmed primitive must create a Route Lock Card before alternate route exploration:

```text
PWN_ROUTE_LOCK
primitive:
why_high_value:
route_owner:
shortest_closure_hypothesis:
confirm_evidence:
falsify_conditions:
next_3_probes:
```

Immediately after the Route Lock Card, compress the branch again before route growth:

```text
PWN_EXPLOIT_NORMAL_FORM
control:
code_addr:
writable_memory:
replay:
leak_surface:
closure_template:
reference_class:
minimum_solve_sketch:
```

Rules:
- If the minimum solve sketch is already concrete, do not keep expanding bridge explanations or alternate families unless they falsify or shorten the selected canonical closure.
- Canonical closure order is `ret2win` -> `pivot+bss/static` -> `single leak + replay` -> `ORW` -> `shell`, unless a higher family is concretely falsified.

Do not switch substrate or route unless the relevant unlock/falsify condition is met.
