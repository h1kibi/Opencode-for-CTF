# CTF Runtime Extension

Local runtime extension layer for OpenCode CTF work.

Goals:

- provide a real `team_*` orchestration surface on top of OpenCode sessions
- provide automatic continuation / todo enforcement through plugin hooks
- provide skill-embedded MCP dynamic lifecycle through SDK MCP add/connect/disconnect

This runtime is intentionally local to this configuration repo so it can evolve without modifying upstream OpenCode.
