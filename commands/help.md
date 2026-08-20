---
description: "Show L0/L1 CTF command surface and default routing rules"
agent: ctf-fast
subtask: false
---

# /help — Command surface

You only need these for normal work.

## L0 — default main entry

| Command         | Purpose                                 |
| --------------- | --------------------------------------- |
| `/ctf <target>` | **唯一默认主入口** — auto-route + solve |
| `/help`         | This help                               |

## L1 — core modes

| Command                | Purpose                            |
| ---------------------- | ---------------------------------- |
| `/ctf-fast <target>`   | Force lightweight fast lane        |
| `/ctf-expert <target>` | Force evidence-driven expert lane  |
| `/resume <context>`    | Resume an existing evidence branch |

## Internal specialist agents

Web, Pwn, Rev, Crypto, Forensics, Misc, and AI-security specialists are
hidden from the user-facing Agent picker and slash-command list. `ctf-expert`
dispatches them internally when the route requires focused expertise.

## Public surface only

The command surface is intentionally small for this semi-automated plugin. Public entrypoints are only:

- `/ctf`
- `/help`
- `/ctf-fast`
- `/ctf-expert`
- `/resume`

Historical compatibility aliases, control-plane helpers, and specialist micro-commands are no longer installed as slash commands. Advanced flows are reached through `/ctf`, `/ctf-expert`, tools, and skills.

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

| Agent        | Role                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `ctf-fast`   | Primary — lightweight CTF solving                                                                                                |
| `ctf-expert` | Primary — evidence-driven CTF solving                                                                                            |
| `researcher` | Support primary — manual post-solve reflection, lessons/retros, and local `rag/knowledge` RAG maintenance (not a CTF solve lane) |

Optional args / notes from user:
$ARGUMENTS
