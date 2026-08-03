@echo off
rem There is no official `cyberchef-mcp` npm package. Point CYBERCHEF_MCP_COMMAND
rem at your own CyberChef MCP server (e.g. a local git checkout) to enable it.
if defined CYBERCHEF_MCP_COMMAND (
  %CYBERCHEF_MCP_COMMAND%
) else (
  echo No CyberChef MCP backend configured. Set CYBERCHEF_MCP_COMMAND first. 1>&2
  exit /b 1
)
