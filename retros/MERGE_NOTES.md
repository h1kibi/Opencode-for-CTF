# opencode scheme-1 merged config

This folder is intended to be copied into your global opencode config directory.

It keeps your daily provider/MCP/rules config and adds CTF commands, tools, skills, templates, and agents.

Default primary agent: `daily`
CTF explicit entry agent: `ctf-rigorous` via `/ctf`
Specialized CTF agents: `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, `ctf-forensics`, `ctf-misc`, `ctf-retro`

Install TypeScript custom tool dependencies after copying:

```bash
cd ~/.config/opencode
npm install
```

On Windows PowerShell, use:

```powershell
cd $env:USERPROFILE\.config\opencode
npm install
```

The CTF package had an MCP named `filesystem`, which would overwrite your existing daily `filesystem` MCP. It was renamed to `ctf_filesystem` in this merged config.


## Explicit switch-agent CTF mode

- `daily` and `ctf-rigorous` are the two selectable primary agents.
- `ctf-rigorous` stays `mode: primary` so the configured agent-cycle shortcut can toggle between daily work and CTF work.
- `/ctf ...` is an initializer that runs inside `ctf-rigorous`, not a detached route-only subtask.
- Specialized CTF agents are subagents; use `/ctf-web`, `/ctf-pwn`, `/ctf-rev`, `/ctf-crypto`, `/ctf-forensics`, or `/ctf-misc` only when you explicitly want that solver.
- CTF permissions are tuned for speed: safe local triage commands and solver-file writes are allowed, while destructive commands, SSH/SCP, unrelated external scanning, and high-risk MCPs remain denied or ask-gated.
