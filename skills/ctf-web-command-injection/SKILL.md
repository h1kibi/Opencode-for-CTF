---
name: ctf-web-command-injection
description: Use for authorized Web CTF challenges involving shell command injection, parameter injection, environment variable injection, or command-line tool wrappers (ping, nslookup, convert, etc.).
compatibility: opencode
---

# CTF Web Command Injection

## Purpose

Use when challenge executes shell commands with user-controlled input, wraps command-line tools, or passes user input to system/exec/popen.

## Signals

- Ping/nslookup/traceroute/dig forms
- File conversion tools (convert, wkhtml, ffmpeg)
- System diagnostic or admin tools
- Shell command wrappers with user parameters

## Rules

- Read source for the exact command construction before fuzzing.
- Test with harmless output-based proof first (id, whoami, uname, ver).
- Avoid destructive commands (rm, dd, shutdown).
- Blind command injection is lower value; prefer output-based before time-based.
- If RCE confirmed, immediately lock and select control plane.

## Output Contract

```markdown
# Command Injection Map

| Endpoint | Command Pattern | Shell/Sink | Output Visible | Primitive |
|---|---|---|---|---|
```
