import path from "node:path"

export const INSTALLER_PROFILES = new Set(["safe", "web", "full"])

export const JSON_FORMATTING = { insertSpaces: true, tabSize: 2, eol: "\n" }

export const SAFE_BASH_RULES = {
  "*": "ask",
  "file *": "allow",
  "strings *": "allow",
  "xxd *": "allow",
  "readelf *": "allow",
  "objdump *": "allow",
  "checksec *": "allow",
  "docker ps*": "allow",
  "docker logs*": "allow",
  "python *": "ask",
  "python3 *": "ask",
  "node *": "ask",
  "rm -rf *": "deny",
  "ssh *": "deny",
  "scp *": "deny",
  "rm *": "deny",
  "del *": "deny",
  "rmdir *": "deny",
  "Remove-Item *": "deny",
  "powershell Remove-Item *": "deny",
  "pwsh Remove-Item *": "deny",
}

export const PROFILE_MCP = {
  safe: [],
  web: ["browser", "markitdown", "context7"],
  full: [
    "browser",
    "markitdown",
    "context7",
    "github",
    "ReVa",
    "gdb-mcp",
    "mysql-mcp",
    "x64dbg-mcp",
    "ssh-mcp",
    "wireshark-mcp",
    "cyberchef-mcp",
    "ctfd-mcp",
  ],
}

export const MCP_DEFAULTS = {
  browser: {
    type: "local",
    command: ["npx", "-y", "@playwright/mcp@latest"],
  },
  markitdown: {
    type: "local",
    command: ["npx", "-y", "mcp-markdownify-server"],
  },
  context7: {
    type: "remote",
    url: "https://mcp.context7.com/mcp",
  },
  github: {
    type: "remote",
    url: "https://api.githubcopilot.com/mcp/",
    headers: {
      Authorization: "Bearer {env:GITHUB_PAT}",
      "X-MCP-Readonly": "true",
    },
  },
  ReVa: {
    type: "local",
    command: ["mcp-reva"],
    timeout: 120000,
  },
  "gdb-mcp": {
    type: "local",
    command: ["{env:GDB_MCP_COMMAND}"],
    timeout: 120000,
  },
  "mysql-mcp": {
    type: "local",
    command: ["{env:MYSQL_MCP_COMMAND}"],
    environment: {
      MYSQL_HOST: "{env:MYSQL_HOST}",
      MYSQL_PORT: "{env:MYSQL_PORT}",
      MYSQL_USER: "{env:MYSQL_USER}",
      MYSQL_PASSWORD: "{env:MYSQL_PASSWORD}",
      MYSQL_DATABASE: "{env:MYSQL_DATABASE}",
    },
    timeout: 120000,
  },
  "x64dbg-mcp": {
    type: "local",
    command: ["{env:X64DBG_MCP_COMMAND}"],
    environment: {
      X64DBG_PATH: "{env:X64DBG_PATH}",
    },
    timeout: 120000,
  },
  "ssh-mcp": {
    type: "local",
    command: ["{env:SSH_MCP_COMMAND}"],
    environment: {
      SSH_MCP_HOST: "{env:SSH_MCP_HOST}",
      SSH_MCP_PORT: "{env:SSH_MCP_PORT}",
      SSH_MCP_USER: "{env:SSH_MCP_USER}",
      SSH_MCP_KEY: "{env:SSH_MCP_KEY}",
    },
    timeout: 120000,
  },
  "wireshark-mcp": {
    type: "local",
    command: ["node", "{managed_root}/mcp-server/vendor/WireMCP/index.js"],
  },
  "cyberchef-mcp": {
    // No official npm package exists for a CyberChef MCP server. Users must
    // provide their own backend command (e.g. a local git checkout) via
    // CYBERCHEF_MCP_COMMAND; the stub stays disabled until then.
    type: "local",
    command: ["{env:CYBERCHEF_MCP_COMMAND}"],
  },
  "ctfd-mcp": {
    type: "local",
    command: ["npx", "-y", "ctfd-mcp-server"],
  },
}

export function managedAssetMappings() {
  // Local knowledge retrieval is served by the external `ctf_rag` MCP server, so
  // no corpus is copied into the managed install any more. The external
  // SecKnowledge snapshot is retired with it (the OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS
  // switch is accepted for backwards compatibility but no longer maps anything).
  return [
    { source: "agents", target: "agents" },
    { source: "commands", target: "commands" },
    { source: "skills", target: path.join("opencode-for-ctf", "skills") },
    { source: "rules", target: path.join("opencode-for-ctf", "rules") },
    { source: "templates", target: path.join("opencode-for-ctf", "templates") },
    { source: "runtime", target: path.join("opencode-for-ctf", "runtime") },
    { source: "mcp-server", target: path.join("opencode-for-ctf", "mcp-server") },
    { source: path.join("dist", "plugin"), target: path.join("opencode-for-ctf", "plugin") },
  ]
}
