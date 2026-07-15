# Seccomp Sandbox Closure

Use when seccomp, sandboxing, blocked shell, static binaries, syscall gadgets, or direct read-flag routes appear.

## First Signals

- `seccomp-tools` output or prctl/seccomp strings.
- `execve` shell payload fails while control path works.
- Static binary with many syscall gadgets.
- Challenge name hints ORW/readflag/sandbox.
- Source uses `seccomp`, `pledge`, jail, chroot, or syscall filters.

## Required Checks

1. Inspect allowlist with `ctf-pwn-syscall-orw-check` or `seccomp-tools`.
2. Determine syscall ABI and architecture.
3. Identify writable buffer for file path/content.
4. Identify output fd/socket.
5. Decide file path: `flag`, `./flag`, `/flag`, source-confirmed path.
6. Choose chain: open/openat + read + write, sendfile, readv/writev, mmap/mprotect if allowed.

## Route Bias

| Allowlist | Preferred closure |
|---|---|
| open/read/write | classic ORW |
| openat/read/write | openat ORW |
| sendfile | open + sendfile to socket/stdout |
| read/write only | existing fd leak or application file-open route |
| mmap/mprotect/read | shellcode/ROP staging if execve unavailable |
| execve allowed | shell may be viable but still verify I/O |

## False Positives

- Shell failing does not mean ROP failed; it may be seccomp.
- `open` blocked but `openat` allowed is common.
- stdout may not be fd 1 in remote services; socket fd may differ.
- ORW needs stable writable memory and path bytes, not only syscall gadgets.

## First Safe Probes

- Run `ctf-pwn-syscall-orw-check`.
- Build minimal syscall-gadget inventory.
- Test local ORW with harmless existing file before final flag path when possible.
- Verify output reaches the client.

## Stop / Pivot Rule

After two shell attempts under seccomp evidence, stop shell mutation and switch to ORW/direct file-read planning.

## Query Terms

seccomp ORW pwn, openat read write ROP, execve blocked shell, syscall gadget static binary, sendfile flag read
