---
description: PWN environment prewarm: verify or prepare common pwnlab Docker images before a contest
agent: ctf-master
subtask: false
---

Prewarm the PWN environment outside active solving so fast mode does not waste time on avoidable setup.

Context:
$ARGUMENTS

Rules:
- This is a preparation command, not an active solve command.
- Ask before building or pulling missing images.
- Default prewarm set: general, general20, general24, debian12, alpine.
- Heavy, aarch64, mipsel, and i386 are optional; build only if explicitly requested.

Checks:
1. Docker availability: `docker version`, `docker images`.
2. Host tool probe:
   `Get-Command file, readelf, objdump, nm, strings, checksec -ErrorAction SilentlyContinue`
3. Existing pwnlab images:
   - `pwnlab:general-ubuntu22.04`
   - `pwnlab:general-ubuntu20.04`
   - `pwnlab:general-ubuntu24.04`
   - `pwnlab:general-debian12`
   - `pwnlab:general-alpine`
4. Inside-image health when image exists:
   `python3 -c "from pwn import *; print('pwntools ok')"`, `gdb --version`, `checksec --version`, `ROPgadget --help`.

Output contract:
```text
PWN_PREWARM
host_tools:
docker:
images_present:
images_missing:
recommended_builds:
ask_before_build: yes/no
fast_mode_ready: yes/no
```
