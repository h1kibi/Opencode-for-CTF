---
description: "Show L0/L1 CTF command surface and default routing rules"
agent: ctf-fast
subtask: false
---

# /help — Command surface

You only need these for normal work.

## L0 — default main entry

| Command | Purpose |
| --- | --- |
| `/ctf <target>` | **唯一默认主入口** — auto-route + solve |
| `/help` | This help |

## L1 — core modes

| Command | Purpose |
| --- | --- |
| `/ctf-fast <target>` | Force lightweight fast lane |
| `/ctf-expert <target>` | Force evidence-driven expert lane |
| `/resume <context>` | Resume an existing evidence branch |

## L2 — category specialists

| Command | Agent |
| --- | --- |
| `/ctf-web` | `ctf-web` |
| `/ctf-pwn` | `ctf-pwn` |
| `/ctf-rev` | `ctf-rev` |
| `/ctf-crypto` | `ctf-crypto` |
| `/ctf-forensics` | `ctf-forensics` |
| `/ctf-misc` | `ctf-misc` |

## L3 — compatibility / advanced support

| Command | Purpose |
| --- | --- |
| `/ctf-solve <target>` | Historical compatibility alias — prefer `/ctf` |
| `/ctf-team-mode ...` | Team Mode controls (expert only) |

Heap mappers, Android macros, Godot helpers, ledger/control-plane commands, and other specialist helpers remain installed for power users and old workflows. They are **not** part of the main entry surface.

## Public surface only

The command surface is intentionally small for this semi-automated plugin. Public entrypoints are only:
- `/ctf`
- `/help`
- `/ctf-fast`
- `/ctf-expert`
- `/resume`
- `/ctf-web`, `/ctf-pwn`, `/ctf-rev`, `/ctf-crypto`, `/ctf-forensics`, `/ctf-misc`

Compatibility aliases, control-plane helpers, and specialist micro-commands may remain installed for migration or internal routing, but they are **not** part of the public command surface.

## Runtime routing

- Tool: `ctf-route-plan` (category + mode; honors `default_mode` from config)
- Hook: `/ctf` injects a **BINDING** route decision before the model acts
- Skill: `ctf-router` (methodology text for triage)
- Tool packs: `ctf-tool-packs` (which tools are registered this session)
- Expert evidence: `ctf-evidence-board` → **Evidence.md** + 3 routes × 4 states
- Expert MCP gate: `ctf-mcp-control` (approve/deny heavy MCP after subagent request)
- Fast surface: `ctf-fast` only sees a lightweight tool allowlist
- Config (optional): `opencode-for-ctf.jsonc` with `default_mode`, `disabled_hooks`, `hashline`, `team_mode`, `continuation`, `tool_packs`

## Primary agents

| Agent | Role |
| --- | --- |
| `ctf-fast` | Primary — lightweight CTF solving |
| `ctf-expert` | Primary — evidence-driven CTF solving |
| `researcher` | Support primary — local knowledge-base maintenance (not a CTF solve lane) |

Optional args / notes from user:
$ARGUMENTS
