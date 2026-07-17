# opencode-for-ctf — CTF Agent Plugin for OpenCode

Plugin-based multi-agent CTF solving for [OpenCode](https://opencode.ai): agents, commands, skills, tools, evidence state, and runtime hooks.

End-user install: [INSTALL.md](./INSTALL.md). Public docs: [README.md](./README.md) / [README_EN.md](./README_EN.md). Security: [SECURITY.md](./SECURITY.md).

## Default path

```text
/ctf ./challenge
```

That is the product entry. It auto-routes category/mode via `ctf-route-plan`, then solves.

| Need | Command |
| --- | --- |
| Auto-route + solve | `/ctf` |
| Force fast lane | `/ctf-fast` |
| Force expert lane | `/ctf-expert` |
| Resume evidence branch | `/ctf-resume` |
| Command surface | `/ctf-help` |

`/ctf-solve` is a historical command alias only; primary agents are `ctf-fast` and `ctf-expert`.

## Structure

```
opencode-for-ctf/
├── src/               # Plugin runtime (hooks, team-mode, MCP lifecycle, config)
├── agents/            # Agent definitions (primary: ctf-fast, ctf-expert)
├── skills/            # CTF skills
├── tools/             # CTF tools (@opencode-ai/plugin)
├── commands/          # Slash commands (L0 default surface is small; many L2 advanced)
├── scripts/           # Install, doctor, diagnostics
├── knowledge/         # Lessons, pattern cards
├── lessons/           # Structured lessons
├── templates/         # Solve templates
├── rules/             # Safety / CTF rules
├── packages/          # Shared libraries (ctf-core, notes, rules, benchmarks)
├── skills-external/   # Optional external CTF skills snapshot
├── runtime/           # Runtime helpers
├── docker/            # PWN/REV multi-arch images
├── opencode.jsonc     # Reference OpenCode config
├── opencode-for-ctf.example.jsonc  # Optional plugin user config
└── package.json
```

## Install

Managed install (recommended):

```bash
npm install
npm run ctf:install
npm run ctf:status -- --strict
```

Manual plugin reference (portable placeholders — replace with your clone path):

```jsonc
{
  "plugin": ["file:/absolute/path/to/Opencode-for-CTF"],
  "default_agent": "ctf-fast", // or ctf-expert
  "skills": {
    "paths": [
      "/absolute/path/to/Opencode-for-CTF/skills",
      "/absolute/path/to/Opencode-for-CTF/skills-external/ctf-skills",
    ],
  },
  "instructions": [
    "/absolute/path/to/Opencode-for-CTF/rules/zh-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/en-solve-rules.md",
  ],
}
```

Optional plugin config (`opencode-for-ctf.jsonc` in the project or OpenCode config dir):

```jsonc
{
  "default_mode": "auto",
  "disabled_hooks": [],
  "hashline": { "enabled": true },
  "team_mode": { "enabled": true, "max_workers": 8 },
  // default packs omit android/godot; use ["all"] for every tool
  // "tool_packs": ["all"],
}
```

See `opencode-for-ctf.example.jsonc`. Inspect packs with tool `ctf-tool-packs` (restart after changes).

## Agent selection

| Scenario | Agent |
| --- | --- |
| Default / unknown | `/ctf` (auto) |
| Simple–medium | `ctf-fast` |
| Complex / multi-step / stuck | `ctf-expert` |

### Agent list

| Agent | Type | Purpose |
| --- | --- | --- |
| `ctf-fast` | **Primary** | Lightweight, intuition-first solving |
| `ctf-expert` | **Primary** | Evidence-driven iterative solving |
| `researcher` | Support primary | Local knowledge-base maintenance (not a CTF solve lane) |
| `ctf-web` / `ctf-pwn` / `ctf-rev` / `ctf-crypto` / `ctf-forensics` / `ctf-misc` | Subagent | Category specialists |
| `ctf-scout` / `ctf-librarian` / `ctf-oracle` / `ctf-verifier` | Subagent | Meta helpers |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `GITHUB_PAT` | GitHub personal access token |
| `SECKB_PYTHON` | SecKB Python interpreter path |
| `GHIDRA_INSTALL_DIR` | Ghidra install directory |
| `JINA_API_KEY` | Jina AI API key |
| `BRAVE_API_KEY` | Brave Search API key |
| `CTF_ALLOWED_ROOTS` | Extra allowed filesystem roots |
| `CTF_ALLOWED_HOSTS` | Extra allowed private/lab hosts |
| `OPENCODE_CONFIG_DIR` | Override OpenCode config directory |
| `OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS` | Install external skills snapshot when set to `1` |

## Development

- Node.js **>= 22.20.0**
- `npm run check` — typecheck + content validation + tests
- `npm run doctor` — managed install doctor
- `npm run build:plugin` / `npm run release:check` / `npm run pack:check` for release shape

## Packages

| Package | Role |
| --- | --- |
| `ctf-core` | Shared types, scoring, **category router** |
| `ctf-notes-core` | Notes / state templates |
| `ctf-rules-engine` | Rules helpers |
| `ctf-benchmark-core` | Benchmark definitions |
| `ctf-adapter-opencode` | OpenCode product constants + router re-exports |

Plugin hooks and installers live in repo-root `src/` and `scripts/`. The adapter package is only a thin harness-facing surface.
