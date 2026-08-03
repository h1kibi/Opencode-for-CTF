# opencode-for-ctf

OpenCode plugin for CTF solving. It bundles agents, slash commands, skills,
tools, local RAG, and optional MCP backends for Web, Pwn, Rev, Crypto,
Forensics, Misc, and AI-security challenges.

> Authorized use only. Run this plugin only on CTF competitions, labs,
> benchmarks, or local training environments you are allowed to test.

## Prerequisites

- Node.js `>= 22.20.0`
- A recent OpenCode build that supports plugins, agents, commands, and skills
- Git for source checkout
- Optional: Docker or WSL for Pwn/Rev workflows
- Optional: Python 3 for Crypto/Misc/Forensics helpers
- Optional: Ghidra, IDA Pro, JADX, GDB, or x64dbg for heavy reverse engineering

Check Node.js with:

```bash
node -v
```

## Install

Managed install from source is the recommended path:

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
npm install
npm run check
npm run ctf:install
npm run ctf:status -- --strict
```

Restart OpenCode completely, then verify with:

```text
/help
/ctf ./challenge
```

The installer:

- Builds the plugin bundle into `dist/plugin`
- Deploys agents, commands, skills, rules, templates, RAG assets, and portable
  MCP backends into the OpenCode config directory
- Merges plugin, skill, instruction, and MCP entries into `opencode.jsonc`
- Writes disabled MCP stubs by default so no external service starts without review
- Records a manifest for later `ctf:upgrade` and `ctf:uninstall` operations

Default config directories:

| Platform      | Typical location                  |
| ------------- | --------------------------------- |
| Linux / macOS | `~/.config/opencode`              |
| Windows       | `%USERPROFILE%\.config\opencode`  |

Override with `OPENCODE_CONFIG_DIR`.

## Manual Reference

For a non-managed setup, build the plugin first and reference the built entry
file from your OpenCode config. Replace absolute paths with your local clone:

```bash
npm install
npm run build:plugin
```

Then add this to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["file:/absolute/path/to/Opencode-for-CTF/dist/plugin/index.js"],
  "default_agent": "ctf-fast",
  "skills": {
    "paths": ["/absolute/path/to/Opencode-for-CTF/skills"]
  },
  "instructions": [
    "/absolute/path/to/Opencode-for-CTF/rules/en-solve-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/zh-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/agent-equipment.md"
  ]
}
```

Managed install is preferred because it also handles upgrades, uninstall, and
manifest-based protection of user-edited files.

## Commands

| Command        | Purpose                                   |
| -------------- | ----------------------------------------- |
| `/ctf`         | Auto-route and solve a challenge          |
| `/ctf-fast`    | Force the lightweight fast lane           |
| `/ctf-expert`  | Force the evidence-driven expert lane     |
| `/resume`      | Resume from an evidence branch            |
| `/help`        | Show the command surface                  |

## Agents

- `ctf-fast`: lightweight, intuition-first solving.
- `ctf-expert`: evidence-driven solving with team-mode orchestration.
- `researcher`: manual post-solve reflection, lessons, and local RAG maintenance.
- Category subagents: `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`,
  `ctf-forensics`, `ctf-misc`, and `ctf-aisec`.

## User Configuration

Copy `opencode-for-ctf.example.jsonc` to the project root or
`$OPENCODE_CONFIG_DIR/opencode-for-ctf.jsonc`, then edit it.

Common keys:

| Key                          | Meaning                                            |
| ---------------------------- | -------------------------------------------------- |
| `default_mode`               | `auto`, `fast`, or `expert` for `/ctf`             |
| `disabled_hooks`             | Disable individual runtime hooks                   |
| `hashline.enabled`           | Enable or disable hashed read/edit tags            |
| `continuation.enabled`       | Enable or disable continuation/compaction hooks    |
| `team_mode.enabled`          | Enable team-mode worker orchestration              |
| `team_mode.max_workers`      | Cap concurrent workers                             |
| `tool_packs`                 | Tool packs registered at startup                   |
| `expert_tool_packs`          | Extra packs merged for expert lanes                |
| `external_skills`            | Whether external skill paths are published         |

Use `"tool_packs": ["all"]` for a full expert environment, or list packs such
as `["core", "web", "pwn", "rev", "crypto", "forensics", "misc"]`.

Restart OpenCode after changing tool packs or MCP configuration.

## Environment Variables

| Variable                                 | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `OPENCODE_CONFIG_DIR`                    | Override the OpenCode config directory            |
| `OPENCODE_CTF_TOOL_PACKS`                | Override tool packs, e.g. `all` or `core,web,pwn` |
| `OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1` | Install external skill snapshots during setup     |
| `DEEPSEEK_API_KEY`                       | DeepSeek API key                                  |
| `GITHUB_PAT`                             | GitHub personal access token, read-only use       |
| `GHIDRA_INSTALL_DIR`                     | Ghidra install directory                          |
| `JINA_API_KEY`                           | Jina AI API key                                   |
| `BRAVE_API_KEY`                          | Brave Search API key                              |
| `CTF_ALLOWED_ROOTS`                      | Extra allowed filesystem roots                    |
| `CTF_ALLOWED_HOSTS`                      | Extra allowed private or lab hosts                |

See `.env.example` for the complete template. Do not commit real secrets.

## MCP Configuration

Managed installs register MCP stubs as disabled by default. Enable them only
after reviewing commands, paths, credentials, and data flow.

The repository provides:

- `mcp-server/ctf-tools-mcp-server.mjs`
- Portable WireMCP backend under `mcp-server/vendor/WireMCP`
- Launchers under `mcp-server/launchers`

Common external MCP integrations:

| MCP name        | Backend                                             |
| --------------- | --------------------------------------------------- |
| `browser`       | `@playwright/mcp`                                   |
| `wireshark-mcp` | Bundled WireMCP                                     |
| `ida-pro`       | `ida-pro-mcp` on PATH                               |
| `jadx-mcp`      | `{env:JADX_MCP_COMMAND}`                            |
| `gdb-mcp`       | `{env:GDB_MCP_COMMAND}`                             |
| `mysql-mcp`     | `{env:MYSQL_MCP_COMMAND}` plus `MYSQL_*`            |
| `x64dbg-mcp`    | `{env:X64DBG_MCP_COMMAND}` plus `X64DBG_PATH`       |
| `ssh-mcp`       | `{env:SSH_MCP_COMMAND}` plus `SSH_MCP_*`            |
| `cyberchef-mcp` | `{env:CYBERCHEF_MCP_COMMAND}`, disabled by default  |
| `ctfd-mcp`      | `npx -y ctfd-mcp-server`, disabled by default       |

Add custom MCP servers under `mcp` in `opencode.jsonc`, then restart OpenCode.

Example:

```jsonc
{
  "mcp": {
    "browser": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"],
      "enabled": false
    }
  }
}
```

## Skills

- Built-in skills live in `skills/` and must be exposed through OpenCode
  `skills.paths`.
- Skills are kept intentionally thin; technique payloads and long playbooks
  live under `skills/<category>/references` and local RAG.
- External SecKnowledge snapshots are optional:

```bash
npm run fetch-skills
```

To copy external reference skills during install:

```bash
OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1 npm run ctf:install
```

`skills-external/` is ignored and not included in the npm package.

## Repository Layout

```text
opencode-for-ctf/
├── src/          # Plugin runtime, hooks, team mode, MCP lifecycle
├── agents/       # Primary agents and category subagents
├── commands/     # Slash command definitions
├── skills/       # CTF skills and references
├── tools/        # CTF tools organized by category
├── rag/          # Local RAG indexes, lessons, retros, knowledge
├── mcp-server/   # Portable MCP server and launchers
├── templates/    # Solve and environment templates
├── rules/        # CTF solve and safety rules
└── scripts/      # Install, doctor, build, release tooling
```

## Development

```bash
npm run check
npm run build:plugin
npm run release:check
npm run pack:check
```

## License

MIT
