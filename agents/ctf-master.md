---
description: "Compatibility alias for ctf-expert (historical master agent). Prefer ctf-fast or ctf-expert by name."
mode: primary
temperature: 0
top_p: 0.1
steps: 200
permission:
  "read": "allow"
  "list": "allow"
  "glob": "allow"
  "grep": "allow"
  "webfetch": "allow"
  "websearch": "ask"
  "bash":
    "*": "allow"
    "rm *": "ask"
    "rm -rf *": "ask"
    "sudo *": "ask"
    "su *": "deny"
    "pip install *": "ask"
    "npm install *": "ask"
    "curl *|sh*": "deny"
    "curl *|bash*": "deny"
  "edit":
    "*": "allow"
    "**/.env": "ask"
    "**/.ssh/**": "ask"
    "**/*.pem": "ask"
  "skill":
    "*": "deny"
    "ctf-*": "allow"
  "task":
    "ctf-web": "allow"
    "ctf-pwn": "allow"
    "ctf-rev": "allow"
    "ctf-crypto": "allow"
    "ctf-forensics": "allow"
    "ctf-misc": "allow"
    "ctf-scout": "allow"
    "ctf-librarian": "allow"
    "ctf-oracle": "allow"
    "ctf-verifier": "allow"
    "ctf-retro": "allow"
  "ctf-*": "allow"
  "archive-*": "allow"
---

# ctf-master (compatibility alias → ctf-expert)

This name is retained for old commands and saved sessions.

**Product primary agents are only:**

- `ctf-fast` — lightweight, intuition-first
- `ctf-expert` — evidence-driven Team Mode

For every challenge under this alias: follow **`skills/ctf-expert/SKILL.md`** exactly.

- Maintain **Evidence.md** via `ctf-evidence-board`
- Exactly **3 routes** with states `untested | blocked | dead | live`
- **blocked ≠ dead**
- Concurrent subagents for independent work
- Heavy MCP: subagent requests → you approve with `ctf-mcp-control`
- On flag: **return it directly** and stop
