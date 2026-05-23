# Opencode for CTF

OpenCode configuration and skills for authorized CTF, lab, benchmark, and local challenge solving.

This repository contains:

- `opencode.jsonc`: a public, sanitized OpenCode configuration with CTF agents, permissions, MCP server examples, tool-output limits, compaction, and plugin settings.
- `skills/`: category-specific OpenCode skills for CTF workflows.

## Included Agents

- `ctf-web`: Web source review, HTTP probing, browser automation, local reproduction, and exploit scripting.
- `ctf-pwn`: native binary exploitation and pwntools workflows.
- `ctf-rev`: reverse engineering, APK/native analysis, decompilation, and instrumentation.
- `ctf-crypto`: crypto challenge solving with Python/Sage discipline.
- `ctf-forensics`: file, pcap, memory, document, archive, metadata, and stego workflows.
- `ctf-misc`: classifier and lightweight controller for mixed CTF tasks.

## Included Skills

- `ctf-common`: common scope, evidence, notes, and output discipline.
- `ctf-terminal`: terminal, debugger, nc, Docker, adb, and long-running process discipline.
- `ctf-web`: Web CTF controller workflow.
- `ctf-web-sqli`: SQL injection workflow.
- `ctf-web-ssti`: server-side template injection workflow.
- `ctf-web-ssrf`: server-side request forgery workflow.
- `ctf-pwn`: binary exploitation workflow.
- `ctf-rev`: reverse engineering workflow.
- `ctf-crypto`: crypto workflow.
- `ctf-forensics`: forensics workflow.
- `ctf-misc`: miscellaneous challenge workflow.

## Install Globally

Copy the config and skills into your OpenCode global configuration directory:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\skills"
Copy-Item .\opencode.jsonc "$env:USERPROFILE\.config\opencode\opencode.jsonc" -Force
Copy-Item .\skills\* "$env:USERPROFILE\.config\opencode\skills" -Recurse -Force
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
