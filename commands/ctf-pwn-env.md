---
description: CTF PWN: Bootstrap/doctor a Docker-based pwnlab environment and lock the analysis substrate
agent: ctf-pwn
subtask: true
---

Use this command as the PWN Environment Doctor for Linux ELF challenges, especially on Windows. Its purpose is to choose and lock one main analysis substrate before exploit work drifts across PowerShell, Docker, and WSL.

Compatibility anchor: Prepare or select a Docker-based pwnlab environment instead of WSL. Prefer Docker pwnlab over WSL.

Challenge/workspace context:
$ARGUMENTS

### Environment Routing Policy

- For Linux ELF PWN on Windows, decide the main substrate in the first two useful rounds.
- Use the challenge-provided Dockerfile/compose first when present and runnable.
- If no challenge runtime exists, use the fixed pwnlab Docker profile as the main analysis container.
- Default to `pwnlab:general-ubuntu22.04` / service `pwn-general` for most Linux ELF PWN because it includes 64/32-bit support, pwntools, gdb/gdbserver, pwndbg/gef, patchelf, one_gadget, ROPgadget/ropper, checksec, libc debug packages, qemu-user/static, strace/ltrace, tmux/vim/git/curl/wget, and common build/binary-analysis tools. Use `pwnlab:general-ubuntu24.04` / service `pwn-general24` when the target or challenge Dockerfile indicates Ubuntu 24.04, glibc 2.39+, or newer toolchain behavior matters.
- Select `pwnlab:heavy-ubuntu22.04` / service `pwn-heavy` only when the challenge needs heavy symbolic/emulation/reversing/fuzzing coverage such as angr, qiling, frida-tools, volatility3, scapy, valgrind, lldb, bpftrace, binwalk, yara, or broader dependency coverage. Select `pwnlab:heavy-ubuntu24.04` / service `pwn-heavy24` when those heavy needs also require Ubuntu 24.04/glibc 2.39+/newer compiler runtime alignment. Heavy images cost more disk/build time; ask before first build/pull.
- Keep prebuilt runtime/toolbox profiles for older glibc, Debian, musl, and multiarch cases: `general18` (`pwnlab:general-ubuntu18.04`), `general20` (`pwnlab:general-ubuntu20.04`), `debian11` (`pwnlab:general-debian11`), `debian12` (`pwnlab:general-debian12`), `alpine` (`pwnlab:general-alpine`), `aarch64` (`pwnlab:aarch64`), and `mipsel` (`pwnlab:mipsel`).
- Prefer Docker pwnlab over WSL on Windows for Linux ELF triage, gdb, pwntools, ROPgadget, one_gadget, seccomp-tools, strace, and ltrace.
- Use `ctf-pwn-docker-harness` to select the closest pwnlab profile from binary arch, libc version, and Dockerfile base image.
- If the challenge bundles `libc.so.6` or `ld`, run `ctf-pwn-libc-runtime-doctor` and treat its recommendation as a hard gate before heap, overlap, or tcache validation.
- Use WSL only as a fallback when Docker is unavailable, materially blocks first evidence, or the user explicitly accepts it.
- Do not install packages globally on Windows during a solve unless the user explicitly asks.
- Once the substrate is locked, do not switch substrates for quoting failures or missing convenience commands; use `ctf-pwn-docker-runner` or `ctf-pwn-wsl-runner`.
- Before claiming the Windows host lacks ELF tools, run a real host probe first:
  `Get-Command file, readelf, objdump, nm, strings, checksec -ErrorAction SilentlyContinue`
- If the host probe finds these commands, perform host ELF triage first and do not force Docker just to read ELF structure.

### Doctor Workflow

1. Run the host probe command:

```powershell
Get-Command file, readelf, objdump, nm, strings, checksec -ErrorAction SilentlyContinue
```

2. If host tools exist, do a host-only triage pass first:
   - `file <binary>`
   - `readelf -h <binary>`
   - `objdump -f <binary>`
   - `nm -an <binary>`
   - `strings -a <binary>`
   - `checksec --file=<binary>`
3. Run `ctf-pwn-docker-harness` on the challenge directory when runtime alignment or deeper tooling is needed.
4. If bundled `libc.so.6` or `ld` exists, run `ctf-pwn-libc-runtime-doctor` and record its explicit loader command before local validation.
5. Run `ctf-pwn-container-probe` immediately after substrate selection. If `python3` or `pwntools` is missing, switch image or fix the container before exploit work.
6. Identify one of: `host-triage-first`, `challenge-docker`, `pwnlab-docker`, or `fallback-wsl`.
7. Verify or plan tool health for:
   - `file`, `readelf`, `objdump`, `nm`, `strings`, `gdb`, `python3`, `pwntools`, `checksec`.
8. Record:
   - active substrate
   - image/service/profile
   - mount path, normally `./:/work`
   - working directory, normally `/work`
   - run command
   - explicit loader command when bundled libc/ld exists
   - unlock condition
9. If pwnlab templates are missing in the challenge workspace, copy them with `pwn_env_setup.ps1`.

### Prebuilt pwnlab Templates

Available under `{env:OPENCODE_CONFIG_DIR}\templates`:

- `docker/docker-compose.revlab.yml`
- `Dockerfile.pwnlab.ubuntu18.04`
- `Dockerfile.pwnlab.ubuntu20.04`
- `Dockerfile.pwnlab.ubuntu22.04`
- `Dockerfile.pwnlab.ubuntu24.04`
- `Dockerfile.pwnlab.i386-ubuntu20.04`
- `Dockerfile.pwnlab.general-ubuntu22.04`
- `Dockerfile.pwnlab.heavy-ubuntu22.04`
- `Dockerfile.pwnlab.general-ubuntu24.04`
- `Dockerfile.pwnlab.heavy-ubuntu24.04`
- `Dockerfile.pwnlab.general-ubuntu18.04`
- `Dockerfile.pwnlab.general-ubuntu20.04`
- `Dockerfile.pwnlab.general-debian11`
- `Dockerfile.pwnlab.general-debian12`
- `Dockerfile.pwnlab.general-alpine`
- `Dockerfile.pwnlab.aarch64`
- `Dockerfile.pwnlab.mipsel`
- `solve_pwn.py`
- `pwn_notes.md`
- `pwn_retro.md`
- `pwn_env_setup.ps1`

### Setup Workflow

1. Run `ctf-pwn-docker-harness` on the challenge directory when artifacts exist.
2. If a challenge Dockerfile/compose exists, prefer it and only use pwnlab as debugger/tool fallback.
3. Otherwise copy pwnlab templates into the challenge workspace with:

```powershell
& "{env:OPENCODE_CONFIG_DIR}/opencode-for-ctf/templates/pwn_env_setup.ps1" -TargetDir . -Profile general
```

Use `-Profile general` for the default comprehensive Ubuntu 22.04 PWN toolbox, `-Profile heavy` for maximal Ubuntu 22.04 coverage, `-Profile general24` / `-Profile heavy24` for Ubuntu 24.04/glibc 2.39+ alignment, `-Profile general18` / `-Profile general20` for older glibc, `-Profile debian11` / `-Profile debian12` for Debian-aligned targets, `-Profile alpine` for musl, `-Profile aarch64` / `-Profile mipsel` for multiarch, or `-Profile i386` for 32-bit x86.

4. Build the selected profile:

```powershell
docker compose -f docker/docker-compose.revlab.yml --profile general build
```

5. Start the selected profile in persistent mode:

```powershell
docker compose -f docker/docker-compose.revlab.yml --profile general up -d pwn-general
```

6. Enter the running container:

```powershell
docker compose -f docker/docker-compose.revlab.yml --profile general exec pwn-general bash
```

7. Inside container, verify:

```bash
file ./chall
checksec --file=./chall
python3 -c "from pwn import *; print('pwntools ok')"
gdb -q ./chall
```

8. Re-enter later without losing the container state:

```powershell
docker compose -f docker/docker-compose.revlab.yml --profile general exec pwn-general bash
```

9. Stop the persistent container when the branch is paused:

```powershell
docker compose -f docker/docker-compose.revlab.yml --profile general stop pwn-general
```

### Output Contract

Return:

```text
PWN_ENV_PLAN
preferred_runtime: host-triage-first | challenge-docker | pwnlab-general | pwnlab-heavy | pwnlab-general18 | pwnlab-general20 | pwnlab-general24 | pwnlab-heavy24 | pwnlab-debian11 | pwnlab-debian12 | pwnlab-alpine | pwnlab-aarch64 | pwnlab-mipsel | pwnlab-ubuntu18 | pwnlab-ubuntu20 | pwnlab-ubuntu22 | pwnlab-ubuntu24 | pwnlab-i386 | fallback-wsl
reason:
host_probe_result: present | partial | missing
active_substrate: SUBSTRATE_WINDOWS_PS | SUBSTRATE_DOCKER | SUBSTRATE_WSL
image:
service:
profile:
mount: ./:/work
workdir: /work
setup_command:
build_command:
run_command:
tool_health:
  file/readelf/objdump/nm/strings/gdb/python3/pwntools/checksec: ok | missing | unchecked
host_triage_commands:
inside_container_checks:
unlock_condition:
explicit_loader_command:
notes:
```

Ask before running Docker build if it may pull images or consume significant time/disk.
