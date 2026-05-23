# Opencode for CTF

OpenCode configuration and skills for authorized CTF, lab, benchmark, and local challenge solving.

This repository contains:

- `opencode.jsonc`: a public, sanitized OpenCode configuration with CTF agents, permissions, MCP server examples, tool-output limits, compaction, and plugin settings.
- `skills/`: category-specific OpenCode skills for CTF workflows.
- `.opencode/commands/`: reusable slash commands for common CTF entry points.
- `templates/`: starter solver scripts for reproducible outputs.

## Quick Start

Use `/ctf` to route an unknown challenge, then run the recommended category command:

```text
/ctf ./challenge
/ctf-web http://127.0.0.1:8000 source in current directory
/ctf-pwn ./chall --remote 127.0.0.1:31337
/ctf-rev ./crackme
/ctf-crypto ./challenge.py
/ctf-forensics ./artifact.pcap
```

The `/ctf` command is route-only. It classifies the challenge and recommends exactly one next command instead of trying to solve under the generic misc agent.

## Included Agents

- `ctf-web`: Web source review, HTTP probing, browser automation, local reproduction, and exploit scripting.
- `ctf-pwn`: native binary exploitation and pwntools workflows.
- `ctf-rev`: reverse engineering, APK/native analysis, decompilation, and instrumentation.
- `ctf-crypto`: crypto challenge solving with Python/Sage discipline.
- `ctf-forensics`: file, pcap, memory, document, archive, metadata, and stego workflows.
- `ctf-misc`: classifier and lightweight controller for mixed CTF tasks.

## Included Skills

- `ctf-common`: common scope, evidence, notes, and output discipline.
- `ctf-router`: fast category classification and command routing.
- `ctf-terminal`: terminal, debugger, nc, Docker, adb, and long-running process discipline.
- `ctf-web`: Web CTF controller workflow.
- `ctf-web-sqli`: SQL injection workflow.
- `ctf-web-ssti`: server-side template injection workflow.
- `ctf-web-ssrf`: server-side request forgery workflow.
- `ctf-web-lfi`: local file inclusion and traversal workflow.
- `ctf-web-upload`: upload validation, storage, and parser workflow.
- `ctf-web-jwt`: JWT and structured token workflow.
- `ctf-web-idor`: IDOR and access-control workflow.
- `ctf-web-xss`: reflected, stored, DOM, and blind XSS workflow.
- `ctf-pwn`: binary exploitation workflow.
- `ctf-rev`: reverse engineering workflow.
- `ctf-crypto`: crypto workflow.
- `ctf-forensics`: forensics workflow.
- `ctf-misc`: miscellaneous challenge workflow.

## Commands

- `/ctf`: route an unknown authorized CTF challenge and recommend the next command.
- `/ctf-web`: start a structured Web CTF solve.
- `/ctf-pwn`: start a structured pwn solve.
- `/ctf-rev`: start a structured reverse engineering solve.
- `/ctf-crypto`: start a structured crypto solve.
- `/ctf-forensics`: start a structured forensics solve.
- `/ctf-misc`: start a structured misc solve.

## Solver Templates

The `templates/` directory contains starter scripts for web, pwn, crypto, reverse engineering, and forensics. Skills should prefer these templates when creating reproducible solvers instead of writing from scratch.

## Install Globally

Copy the config and skills into your OpenCode global configuration directory:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\skills"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\commands"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\templates"
Copy-Item .\opencode.jsonc "$env:USERPROFILE\.config\opencode\opencode.jsonc" -Force
Copy-Item .\skills\* "$env:USERPROFILE\.config\opencode\skills" -Recurse -Force
Copy-Item .\.opencode\commands\* "$env:USERPROFILE\.config\opencode\commands" -Recurse -Force
Copy-Item .\templates\* "$env:USERPROFILE\.config\opencode\templates" -Recurse -Force
```

Restart OpenCode after copying. OpenCode does not hot-reload config or skills.

## Secrets

This repository intentionally omits provider API keys and private tokens.

If you need API keys for MCP servers or providers, keep them in environment variables or a private local config such as `opencode.local.jsonc`.

## Safety Scope

These skills are for authorized use only:

- CTFs.
- Local labs.
- Benchmarks.
- Explicitly authorized challenge environments.

Do not use this configuration to attack unrelated third-party systems.

This configuration is not a sandbox. Run untrusted CTF binaries and malware-like artifacts inside a disposable VM, container, or isolated workspace.
