# MCP Server Layout

This directory holds repo-managed MCP server assets and launchers.

## Layout

- `ctf-tools-mcp-server.mjs` — exposes repo `ctf-*` / `archive-*` tools over MCP stdio
- `launchers/browser.cmd` — stable wrapper for `@playwright/mcp`
- `launchers/cyberchef-mcp.cmd` — wrapper for a user-supplied CyberChef MCP backend (`CYBERCHEF_MCP_COMMAND`); no official npm package exists
- `launchers/ctfd-mcp.cmd` — stable wrapper for `ctfd-mcp-server`
- `launchers/wiremcp.cmd` — stable wrapper for vendored local WireMCP startup (`mcp-server/vendor/WireMCP/`)

## Why this directory exists

OpenCode config should point at stable repo-managed wrappers rather than scattered
absolute paths or ad-hoc scripts. This makes:

- config easier to audit
- upgrades easier to maintain
- external MCP paths easier to change in one place

## Expected OpenCode config

```jsonc
"mcp": {
  "ctf-tools": {
    "type": "local",
    "command": ["node", "C:/Projects/Agent-projects/Opencode-for-CTF/mcp-server/ctf-tools-mcp-server.mjs"],
    "enabled": true
  },
  "browser": {
    "type": "local",
    "command": ["C:/Projects/Agent-projects/Opencode-for-CTF/mcp-server/launchers/browser.cmd"],
    "enabled": true
  },
  "cyberchef-mcp": {
    "type": "local",
    "command": ["C:/Projects/Agent-projects/Opencode-for-CTF/mcp-server/launchers/cyberchef-mcp.cmd"],
    "enabled": false
  },
  "wireshark-mcp": {
    "type": "local",
    "command": ["C:/Projects/Agent-projects/Opencode-for-CTF/mcp-server/launchers/wiremcp.cmd"],
    "enabled": true
  },
  "ctfd-mcp": {
    "type": "local",
    "command": ["C:/Projects/Agent-projects/Opencode-for-CTF/mcp-server/launchers/ctfd-mcp.cmd"],
    "enabled": false
  }
}
```
