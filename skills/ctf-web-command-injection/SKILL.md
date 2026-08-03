---
name: ctf-web-command-injection
description: Use for authorized Web CTF challenges involving shell command injection, parameter injection, environment variable injection, or command-line tool wrappers (ping, nslookup, convert, etc.).
compatibility: opencode
---

# CTF Web Command Injection

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching command-injection signal; do not use it for generic Web recon.

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
