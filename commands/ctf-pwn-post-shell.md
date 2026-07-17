---
description: PWN post-shell closure: after likely shell/code execution, run low-noise commands to verify and read flag
agent: ctf-expert
subtask: true
---

Use this when a payload likely spawned a shell, one-shot command execution, or a shell-like tube but the flag is not yet observed.

Input:
$ARGUMENTS

Default low-noise closure sequence:
1. `id`
2. `pwd`
3. `ls -la .`
4. `ls -la /`
5. `cat flag 2>/dev/null || true`
6. `cat flag.txt 2>/dev/null || true`
7. `cat /flag 2>/dev/null || true`
8. `cat /flag.txt 2>/dev/null || true`
9. `find / -maxdepth 2 -iname '*flag*' 2>/dev/null | head -20`

Rules:
- Prefer `ctf-pwn-post-shell-runner` when the exploit exposes `io`, `p`, `r`, `tube`, or `get_io()`.
- Otherwise use `ctf-pwn-expect-runner mode=docker` or a pwntools exploit that keeps the same tube alive.
- Keep the command sequence short and deterministic; do not start broad filesystem crawling unless the challenge already grants shell and no common path works.
- If stdout/stderr differs or commands do not echo, classify with near-success / prompt-desync logic before mutating gadgets.

Output contract:
```text
PWN_POST_SHELL
shell_signal:
commands_sent:
flag_detected:
flag_value:
stdout_summary:
next_if_no_flag:
```
