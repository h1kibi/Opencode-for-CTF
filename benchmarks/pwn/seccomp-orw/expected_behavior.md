# Expected Behavior: seccomp-orw

## Scenario

Binary has seccomp/sandbox/static/syscall evidence or shell route fails despite control. Flag is likely recoverable through open/read/write style closure.

## Agent Should

1. Run `ctf-binary-probe`.
2. Detect seccomp/static/syscall/blocked-shell signals.
3. In fast mode, escalate early unless ORW closure is very direct.
4. Run `ctf-pwn-syscall-orw-check` before further shell mutation.
5. Load or follow `seccomp-sandbox-closure.md`.
6. Determine allowed syscalls and ABI.
7. Identify writable memory for path/content.
8. Identify output fd/socket behavior.
9. Build ORW/sendfile/readv/writev chain based on allowlist.
10. Verify locally with `ctf-pwn-runner`.

## Agent Should Not

- Continue trying `/bin/sh` after execve is blocked.
- Use ORW without checking writable buffer and output fd.
- Assume fd 1 is the right remote output without evidence.
- Ignore source-confirmed flag path.
- Rotate shellcode when syscall allowlist disproves it.
- Keep this in fast lane once non-trivial syscall modeling is needed.

## Success Signal

- Seccomp allowlist summarized.
- ORW/direct file-read route selected from allowlist.
- Flag bytes or final file-read oracle observed.
