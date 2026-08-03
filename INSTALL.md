# Installation Guide

This guide covers installing **opencode-for-ctf** into [OpenCode](https://opencode.ai).

> **Authorized use only.** Install and run this plugin only for CTF competitions, labs, benchmarks, and local training you are allowed to test. See [SECURITY.md](./SECURITY.md).

## Prerequisites

- **Node.js `>= 22.20.0`**
- A working OpenCode install that loads plugins, agents, commands, and skills
- Git (for source checkout)
- Optional: Docker / WSL for pwn & reverse workflows

Check Node:

```bash
node -v
```

## Recommended: managed install from source

Until the package is published to npm, install from a git clone.

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
npm install
npm run check
npm run ctf:install
npm run ctf:status -- --strict
```

Equivalent CLI entrypoints:

```bash
node scripts/cli.mjs install
node scripts/cli.mjs status --strict
# or, after package bin is available:
# npx opencode-for-ctf install
```

### What the installer does

1. Builds the plugin bundle (`npm run build:plugin` → `dist/plugin/`)
2. Deploys managed assets into the OpenCode config directory:
   - `agents/` and `commands/` directly under the OpenCode config directory, so `/ctf`, `/help`, `ctf-fast`, `ctf-expert`, and category subagents are visible after restart
   - built-in `skills/` under `opencode-for-ctf/skills`
   - rules, templates, RAG/knowledge assets, and the self-contained plugin bundle
   - bundled portable MCP backends such as WireMCP
3. Merges plugin, skill, instruction, tool, and profile MCP entries into existing `opencode.jsonc` with **minimal JSONC edits** (comments preserved).
   - `plugin[]` points to the managed bundle: `opencode-for-ctf/plugin/index.js`
   - `skills.paths[]` publishes the managed CTF skill directory so agents can resolve their assigned skills at runtime
   - `instructions[]` includes the CTF rules and agent equipment rules
   - profile MCP entries are written as disabled stubs; they are registered for later activation but not auto-enabled
4. If you manually wire the repo instead of using the managed installer, you must also expose the skill directory through OpenCode `skills.paths`; agent permission declarations alone do not publish skills into the runtime catalog.
5. Creates backups before overwriting managed files
6. Writes a SHA-256 **manifest** so later upgrades/uninstalls skip files you edited after install
7. Sets `default_agent` to `ctf-fast` when missing
8. Stages only portable runtime assets; machine-specific MCP launchers stay external and env-driven

### Default config locations

| Platform      | Typical OpenCode config dir                        |
| ------------- | -------------------------------------------------- |
| Linux / macOS | `~/.config/opencode`                               |
| Windows       | `%USERPROFILE%\.config\opencode` or XDG equivalent |

Override with:

```bash
# Bash
export OPENCODE_CONFIG_DIR=/path/to/opencode-config

# PowerShell
$env:OPENCODE_CONFIG_DIR="C:\path\to\opencode-config"
```

### Install profiles

```bash
npm run ctf:install                     # default full: registers disabled MCP stubs for all supported CTF integrations
npm run ctf:install -- --profile safe   # no MCP definitions
npm run ctf:install -- --profile web    # registers disabled browser / markitdown / context7 stubs
npm run ctf:install -- --profile full   # explicit full profile
```

**Important:** profile MCP entries remain **disabled**. Review command, paths, credentials, and data flow before enabling any MCP.

Use `npm run ctf:status -- --strict` after install or upgrade. It verifies the managed files, plugin bundle registration, `skills.paths`, agent/command counts, and the MCP stubs expected by the selected install profile.

The installer does **not** copy reference MCP definitions that hard-code machine-specific absolute paths.
Specialist MCPs such as IDA Pro, JADX, GDB, MySQL, x64dbg, and SSH integrations are expected to be provisioned externally and referenced through environment-backed launcher paths.
Current recommended browser backend is Playwright MCP; the Wireshark slot uses the bundled WireMCP backend copied into the managed install directory.
IDA Pro uses `ida-pro-mcp` (stdio is the default transport; `--stdio` is not a valid flag in v2.x); the other external specialist MCP stubs use `JADX_MCP_COMMAND`, `GDB_MCP_COMMAND`, `MYSQL_MCP_COMMAND`, `X64DBG_MCP_COMMAND`, `SSH_MCP_COMMAND`, and `CYBERCHEF_MCP_COMMAND`.

### After install

1. Restart OpenCode completely
2. Run `/help`
3. Solve with `/ctf ./challenge`

## Install with an LLM coding agent

Paste:

> Clone `https://github.com/h1kibi/Opencode-for-CTF.git`, read `INSTALL.md` and `SECURITY.md`, verify Node.js is `>=22.20.0`, then run `npm install`, `npm run check`, `npm run ctf:install`, and `npm run ctf:status -- --strict`. Use the default `full` profile, which registers MCP stubs disabled by default. Do not enable any MCP server and do not replace my provider/model configuration. If installation or validation fails, stop and report the exact error; do not delete or overwrite configuration files I have modified.

## npm / packaged install (future)

After the package is published (or when testing a local pack):

```bash
npx opencode-for-ctf install
npx opencode-for-ctf install --profile web
npx opencode-for-ctf status --strict
npx opencode-for-ctf doctor
```

Local package smoke:

```bash
npm run pack:check
npm pack
# then install from the produced tarball if desired
```

## Upgrade

From the same source checkout (or updated clone):

```bash
git pull
npm install
npm run ctf:upgrade
npm run ctf:status -- --strict
```

Upgrade refreshes managed files whose manifest hashes still match. Files you modified after install are left alone.

## Uninstall

```bash
npm run ctf:uninstall
# or
node scripts/cli.mjs uninstall
```

Uninstall removes managed files recorded in the manifest and reverses installer-owned config merges where safe. It will not delete user-modified managed copies.

## Status & doctor

```bash
npm run ctf:status
npm run ctf:status -- --strict
npm run doctor
```

`--strict` fails non-zero when the install is incomplete or inconsistent — useful in CI or agent-driven setup.

## Isolated install for testing

PowerShell:

```powershell
$env:XDG_CONFIG_HOME="$PWD\.tmp-xdg"
$env:OPENCODE_CONFIG_DIR="$env:XDG_CONFIG_HOME\opencode"
npm run ctf:install
npm run ctf:status -- --strict
```

Bash:

```bash
export XDG_CONFIG_HOME="$PWD/.tmp-xdg"
export OPENCODE_CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
npm run ctf:install
npm run ctf:status -- --strict
```

## Optional plugin config

Copy the example and edit:

```bash
cp opencode-for-ctf.example.jsonc opencode-for-ctf.jsonc
# or place it under $OPENCODE_CONFIG_DIR
```

Useful keys:

| Key                     | Meaning                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default_mode`          | `auto` / `fast` / `expert` for `/ctf`                                                                                                                    |
| `disabled_hooks`        | Turn off individual runtime hooks                                                                                                                        |
| `tool_packs`            | Which tool packs register at startup                                                                                                                     |
| `expert_tool_packs`     | Extra packs merged for expert-heavy machines                                                                                                             |
| `external_skills`       | Whether plugin-side skill publication is expected; false means skill folders may exist locally while runtime catalog publication is still considered off |
| `team_mode.max_workers` | Cap concurrent workers                                                                                                                                   |

Environment overrides:

| Variable                                 | Purpose                                   |
| ---------------------------------------- | ----------------------------------------- |
| `OPENCODE_CTF_TOOL_PACKS`                | e.g. `all` or `core,web,pwn`              |
| `OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1` | Copy external SecKnowledge reference skill snapshot (large) |
| `OPENCODE_CTF_FORCE_BUILD=0`             | Skip rebuild if `dist/` already exists    |
| `CTF_ALLOWED_ROOTS`                      | Extra allowed filesystem roots            |
| `CTF_ALLOWED_HOSTS`                      | Extra hosts for web tools                 |

## Slim package contents

The default published / installed surface is intentionally slim:

| Included                                                       | Excluded by default                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Current pattern index `ljagiello-ctf-skills.cards.v9.json`     | Intermediate card dumps `cards.json` / `cards.v2`–`v8`                    |
| `java-web` + `pwn-curated` indexes, lessons, pwn/rev knowledge | Pattern-card build/smoke scripts                                          |
| Built-in `skills/`, agents, commands, plugin bundle            | `skills-external/` (opt-in)                                               |
| Runtime docs / env helpers                                     | `benchmarks/`, `retros/`, `patches/`, machine-specific MCP server sources |

Managed install applies the same knowledge filter even on a full source checkout, so intermediate cards are not copied into `~/.config/opencode`.

## External skills snapshot

`npm install` does **not** fetch network content. The npm tarball also does **not** ship `skills-external/`.

```bash
npm run fetch-skills   # clones/updates skills-external/secknowledge-skill (source checkout)
```

To also copy that reference snapshot into the OpenCode config directory (it remains reference-only and is not added to `skills.paths`):

```bash
# Bash
OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1 npm run ctf:install

# PowerShell
$env:OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS="1"
npm run ctf:install
```

License/attribution: [third_party/NOTICE.md](./third_party/NOTICE.md).

## Manual setup (fallback)

Only if you cannot use the managed installer. Replace paths with absolute paths on your machine.
Run `npm run build:plugin` first, then point OpenCode at the built plugin entry file.

`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["file:/absolute/path/to/Opencode-for-CTF/dist/plugin/index.js"],
  "default_agent": "ctf-fast",
  "skills": {
    "paths": ["/absolute/path/to/Opencode-for-CTF/skills"],
  },
  "instructions": [
    "/absolute/path/to/Opencode-for-CTF/rules/zh-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/en-solve-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/agent-equipment.md",
  ],
}
```

Manual mode has **no** manifest, upgrade, or safe uninstall. It also does not copy `agents/` and `commands/` into the OpenCode config root for you; use the managed installer when you want `/ctf`, `/help`, all CTF agents, plugin tools, skills, and profile MCP stubs registered in one step.

### Legacy generator

```bash
cp .env.example .env
# set PLUGIN_DIR and WORKSPACE_DIR
npm run setup
```

This generates a standalone `opencode.json` and is kept only for compatibility.

## Workspace template

For challenge workspaces, copy [CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc](./CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc) to:

```text
<workspace>/opencode.jsonc
# or
<workspace>/.opencode/opencode.jsonc
```

Recommended layout:

```text
work/<challenge-id>/
  Evidence.md / evidence.json
  solve.py
  retro.md
  ...
```

## Troubleshooting

| Symptom                           | What to try                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `release check` fails locally     | Run `npm run build:plugin` first; `dist/` is gitignored                        |
| OpenCode does not see agents      | Confirm install target dir; restart OpenCode; `npm run ctf:status -- --strict` |
| Plugin path wrong after move      | Re-run `npm run ctf:upgrade` from the new checkout                             |
| MCP tools missing                 | Expected — defaults disabled; enable only after review                         |
| Permission / path denied in tools | Check `CTF_ALLOWED_ROOTS` and avoid sensitive paths (`.env`, `.ssh`, …)        |
| Node engine errors                | Upgrade to Node `>= 22.20.0`                                                   |
| Want clean reinstall              | `npm run ctf:uninstall` then `npm run ctf:install`                             |

## Safety notes for installers

- Default profile is **full**; MCP stubs are registered disabled
- MCP stays **off** until you enable it
- Installer avoids copying machine-specific absolute MCP paths from reference configs
- Backups + manifest protect user edits
- This software can execute solver tooling — keep secrets out of challenge workspaces and never commit `.env`

## Related docs

- [README.md](./README.md) / [README_EN.md](./README_EN.md)
- [SECURITY.md](./SECURITY.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [opencode-for-ctf.example.jsonc](./opencode-for-ctf.example.jsonc)
