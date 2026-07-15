---
description: CTF runtime: manage skill-embedded MCP dynamic lifecycle for the current session
agent: ctf-master
subtask: false
---

Use the skill-embedded MCP lifecycle runtime.

Context:
$ARGUMENTS

Rules:
- Activate MCP leases only when a matching skill is actually being used.
- Prefer release-on-idle behavior for noisy or expensive MCPs.
- Use this runtime to inspect and debug per-session MCP leases when skill routing or MCP visibility is unclear.

Common operations:
- `ctf-skill-mcp-lifecycle activate skillName=<skill>`
- `ctf-skill-mcp-lifecycle release skillName=<skill>`
- `ctf-skill-mcp-lifecycle release_all_session`
- `ctf-skill-mcp-lifecycle list`

Return compactly:
- target skill
- activated/released lease names
- whether the lease is session-scoped and disconnect-on-idle
