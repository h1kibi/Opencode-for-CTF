---
name: ctf-terminal
description: Use for authorized CTF work involving shell commands, nc, gdb, frida, adb, docker logs, long-running processes, or interactive tools. Enforces real-output evidence, timeouts, summaries, and anti-hallucination discipline.
compatibility: opencode
---

# CTF Terminal Discipline

## Purpose

Use this skill whenever solving depends on terminal output, interactive programs, debuggers, network clients, Docker logs, instrumentation, or long-running commands.

This skill extracts the interaction discipline from SWE-agent/EnIGMA-style CTF tooling: the agent must separate intended action, real observation, and interpretation.

## Scope

Use only for local, lab, CTF, or explicitly authorized challenge targets.

## Inputs

Before running commands, know:

- Working directory.
- Command purpose.
- Expected output or signal.
- Timeout or exit condition.
- Whether the command is interactive, destructive, remote, or long-running.

## Workflow

1. State the command purpose in `notes.md` for non-trivial commands.
2. Prefer non-interactive commands that terminate on their own.
3. For interactive targets, script the interaction with Python, pwntools, expect-like logic, or command flags.
4. Capture stdout, stderr, exit status, and important timing behavior.
5. Summarize output into facts before planning the next command.
6. If a command fails, record the failure reason and choose a fallback instead of rephrasing the same claim.

## Tool Discipline

- Do not claim verification without real command output.
- Do not leave `nc`, `gdb`, `frida`, `adb`, servers, or logs waiting indefinitely.
- For pwn, prefer pwntools scripts over shell pipes for repeated binary or netcat interaction.
- For debugger work, prefer scripted commands such as `gdb -batch` or saved command files when possible.
- For binary data, prefer `xxd`, `hexdump`, or Python parsing over dumping raw control bytes into the transcript.
- For long outputs, extract only key offsets, addresses, exceptions, status codes, routes, hashes, constants, and stack traces.
- For APK/JADX/apktool/native triage, prefer tools that emit a compact summary plus artifact paths. Use `ctf-artifact-page` for structured paging/search rather than relying on truncated terminal output.

## Evidence Requirements

A terminal-derived conclusion must cite one of:

- Exact command output.
- Exit status or crash signal.
- Stack trace or debugger state.
- HTTP status/body/header observation.
- Reproduced input/output transcript.
- Generated artifact path and hash/size when relevant.

## Output Contract

Record in `notes.md`:

- Command purpose.
- Command run.
- Key output summary.
- Interpretation.
- Next step or fallback.

Do not write `agent_flag.txt` unless the terminal output or challenge behavior verifies the flag.

## Stop Conditions

Stop or ask when:

- A command requires credentials not provided.
- A command would modify or delete original evidence.
- A command would scan or attack out-of-scope hosts.
- An interactive process cannot be controlled with available tools.
- Repeated command attempts produce no new information.
