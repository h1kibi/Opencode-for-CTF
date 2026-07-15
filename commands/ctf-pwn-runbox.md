---
description: PWN fast runbox: use prebuilt pwnlab Docker without copying compose templates
agent: ctf-master
subtask: false
---

Use a prebuilt Docker runbox for fast PWN work without copying per-challenge Docker templates.

Context:
$ARGUMENTS

Profiles:
- default/general: `pwnlab:general-ubuntu22.04` -> pwntools, gdb, checksec, readelf/objdump/nm/strings, patchelf, ROPgadget, one_gadget, seccomp-tools, strace/ltrace
- general20: `pwnlab:general-ubuntu20.04` -> same toolbox, tuned for older glibc
- general24: `pwnlab:general-ubuntu24.04` -> same toolbox, tuned for glibc 2.36+/Ubuntu 24.04
- debian12: `pwnlab:general-debian12` -> Debian-aligned toolbox
- alpine: `pwnlab:general-alpine` -> musl-oriented toolbox; prefer challenge container for runtime truth
- aarch64: `pwnlab:aarch64` -> multiarch debugging/tooling
- mipsel: `pwnlab:mipsel` -> multiarch debugging/tooling
- heavy/heavy24: larger symbolic/emulation/reversing coverage; not a fast default

Rules:
- Prefer `ctf-pwn-runbox` for command generation or one-shot execution.
- Prefer this for simple fast-lane probes and exploit runs.
- Immediately follow container start with `ctf-pwn-container-probe` so the branch does not split across host/WSL/container because `pwntools` or `gdb` was missing.
- Do not copy Dockerfile/compose unless persistence, service reproduction, or rigorous handoff needs it.
- Ask before building/pulling images if the selected image is missing.
- For complex shell quoting, prefer `ctf-pwn-docker-runner` with a short script.

Suggested tool calls:
```text
ctf-pwn-runbox profile=general command="bash"
ctf-pwn-container-probe image=pwnlab:general-ubuntu22.04 binary=./chall libc=./libc.so.6
```

Suggested raw command:
```powershell
docker run --rm -it --cap-add=SYS_PTRACE --security-opt seccomp=unconfined -v "${PWD}:/work" -w /work pwnlab:general-ubuntu22.04 bash
```

Non-interactive probe shape:
```powershell
docker run --rm --cap-add=SYS_PTRACE --security-opt seccomp=unconfined -v "${PWD}:/work" -w /work pwnlab:general-ubuntu22.04 bash -lc "file ./chall && checksec --file=./chall && python3 exploit.py"
```

Output contract:
```text
PWN_RUNBOX
profile:
image:
mode: interactive | one-shot
command:
missing_image: yes/no
next_inside_container_check:
```
