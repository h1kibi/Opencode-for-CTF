# PWN Runtime Substrate Lock

Use this reference once Linux ELF PWN is confirmed on Windows or when runtime-sensitive probes start drifting across host, Docker, and WSL.

Rules:

- Pick one active substrate per branch: `SUBSTRATE_WINDOWS_PS`, `SUBSTRATE_DOCKER`, or `SUBSTRATE_WSL`.
- Host triage may stay on Windows PowerShell only for read-only ELF evidence if the required host tools are present.
- Escalate to Docker when libc/ld alignment, exploit execution, gdb, allocator behavior, seccomp, or remote-equivalence matters.
- Use WSL only as an explicit fallback when Docker is unavailable or materially blocks the first meaningful probe.
- Do not switch substrate because of quoting friction alone; use the substrate runner first.

Minimal lock card:

- chosen substrate:
- why chosen:
- mount/work path:
- unlock condition:
- next runtime-sensitive probe:
