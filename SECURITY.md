# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

Older calendar tags such as `2026.07.0` are historical only and are not supported as a separate release line.

## Reporting a Vulnerability

This project handles CTF challenge artifacts and executes solver tools. If you discover a security vulnerability, please report it privately.

**Do not report security vulnerabilities through public GitHub issues.**

Instead, please open a GitHub Security Advisory at:

https://github.com/h1kibi/Opencode-for-CTF/security/advisories/new

You can also reach the maintainers via the GitHub Issues page with a `[SECURITY]` prefix in the title, keeping sensitive details encrypted or out-of-band.

### What to include

- Type of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

### What to expect

- Acknowledgment within 48 hours
- Regular updates on progress
- Credit for the discovery (if desired)

## Scope

This policy covers:

- The plugin runtime (`src/`) — improper state manipulation, privilege escalation, cross-session data leaks
- Tool definitions (`tools/`) — command injection, path traversal, unsafe file operations
- Scripts (`scripts/`) — credential exposure, data corruption
- Managed installer behavior that can modify OpenCode configuration

## Out of Scope

- Challenges being solved (by design, agents execute arbitrary solver code)
- API keys in `.env` (users are responsible for securing their own credentials)
- Third-party MCP servers and their dependencies
- Unauthorized use of CTF tooling against systems you do not own or have permission to test

## Authorized Use

This project is intended only for:

- Authorized CTF competitions
- Explicitly authorized labs / ranges
- Local training and benchmarks you control

Do not use it against unauthorized targets.

## Safe Tool Design

All tools in this plugin must follow these security principles:

1. **Path confinement** — File operations must stay inside allowed roots. Use the `resolveAllowedPath()` / `resolveInsideWorkspace()` pattern.
2. **No shell injection** — Prefer `safeExec()` from `tools/lib/exec-utils.ts` with an argv array, not a shell string.
3. **Environment isolation** — Docker containers should be ephemeral. Use pinned base images with no network access when safe.
4. **Deny by default** — Agent permissions start with allow-listed commands; unknown commands are denied or require user approval.
5. **MCP off by default** — Installer profiles may stage MCP stubs, but they remain disabled until reviewed and enabled by the user.
