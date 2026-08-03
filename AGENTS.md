# opencode-for-ctf - CTF Agent Plugin for OpenCode

Plugin-based multi-agent CTF solving for [OpenCode](https://opencode.ai): agents, commands, skills, tools, evidence state, local RAG, and runtime hooks.

End-user install: [INSTALL.md](./INSTALL.md). Public docs: [README.md](./README.md) / [README_EN.md](./README_EN.md). Security: [SECURITY.md](./SECURITY.md).

## Default Path

```text
/ctf ./challenge
```

That is the product entry. It auto-routes category/mode via `ctf-route-plan`, then solves.

| Need                   | Command       |
| ---------------------- | ------------- |
| Auto-route + solve     | `/ctf`        |
| Force fast lane        | `/ctf-fast`   |
| Force expert lane      | `/ctf-expert` |
| Resume evidence branch | `/resume`     |
| Command surface        | `/help`       |

Historical micro-commands are no longer installed as slash commands; primary agents are `ctf-fast` and `ctf-expert`.

## Structure

```text
opencode-for-ctf/
├── src/               # Plugin runtime (hooks, team-mode, MCP lifecycle, config)
├── agents/            # Agent definitions (primary: ctf-fast, ctf-expert)
├── skills/            # CTF skills
├── tools/             # CTF tools (@opencode-ai/plugin)
├── commands/          # Slash commands (L0 default surface is small; many L2 advanced)
├── scripts/           # Install, doctor, diagnostics
├── rag/               # Local RAG: runtime indexes, lessons, optional source mirrors
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

## RAG Layout

Canonical runtime RAG lives under `rag/`:

| Path                     | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `rag/knowledge/`         | Published and managed-installed compact RAG indexes/cards/manifests   |
| `rag/lessons/`           | Human-maintained structured lesson source files                       |
| `rag/Des-CTF-Knowledge/` | Local raw source mirror; ignored, not packaged, not managed-installed |

Runtime code prefers `rag/knowledge` and `rag/lessons`. Legacy `knowledge` and `lessons` remain fallback-only for older installs or external checkouts.

Knowledge layers (keep them role-separated; do not duplicate content across layers):

| Layer                                    | Role                                                                                             | Consumers                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| `skills/`                                | Thin decision discipline (signals/rules/contracts), no payload libraries                         | Prompt loading              |
| `rag/knowledge/pattern-cards/*.json`     | Searchable technique cards; `curated-cards.json` is hand-curated and loads first (wins id dedup) | `ctf-pattern-card-search`   |
| `rag/knowledge/pwn`, `rag/knowledge/rev` | Full playbooks backing the curated card summaries (`source_file` provenance)                     | `ctf-skill-repo-search`     |
| `rag/lessons`                            | Post-hoc failure memory                                                                          | `ctf-lesson-search` / retro |

## Install

Managed install (recommended):

```bash
npm install
npm run ctf:install
npm run ctf:status -- --strict
```

Manual plugin reference (portable placeholders - replace with your clone path):

```jsonc
{
  // Run `npm run build:plugin` first. Managed install is preferred because it
  // also copies agents/commands and registers full-profile disabled MCP stubs.
  "plugin": ["file:/absolute/path/to/Opencode-for-CTF/dist/plugin/index.js"],
  "default_agent": "ctf-fast", // or ctf-expert
  "skills": {
    // External SecKnowledge is reference-only; ctf-skill-repo-search loads it on demand.
    "paths": [
      "/absolute/path/to/Opencode-for-CTF/skills",
    ],
  },
  "instructions": [
    "/absolute/path/to/Opencode-for-CTF/rules/zh-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/en-solve-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/agent-equipment.md",
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

## Agent Selection

| Scenario                     | Agent         |
| ---------------------------- | ------------- |
| Default / unknown            | `/ctf` (auto) |
| Simple-medium                | `ctf-fast`    |
| Complex / multi-step / stuck | `ctf-expert`  |

## Agent List

| Agent                                                                           | Type            | Purpose                                                                                                               |
| ------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ctf-fast`                                                                      | Primary         | Lightweight, intuition-first solving                                                                                  |
| `ctf-expert`                                                                    | Primary         | Evidence-driven iterative solving                                                                                     |
| `researcher`                                                                    | Support primary | Manual post-solve reflection, lessons/retros, and local `rag/knowledge` RAG import/maintenance (not a CTF solve lane) |
| `ctf-web` / `ctf-pwn` / `ctf-rev` / `ctf-crypto` / `ctf-forensics` / `ctf-misc` / `ctf-aisec` | Subagent        | Category specialist playbooks; AI-security covers LLM agents, prompt injection, model artifacts, adversarial ML, RAG/tool boundaries, and unsafe serialization |
| `ctf-scout` / `ctf-librarian` / `ctf-oracle` / `ctf-verifier`                   | Subagent        | Meta helpers                                                                                                          |

## Environment Variables

| Variable                               | Purpose                                          |
| -------------------------------------- | ------------------------------------------------ |
| `DEEPSEEK_API_KEY`                     | DeepSeek API key                                 |
| `GITHUB_PAT`                           | GitHub personal access token                     |
| `SECKB_PYTHON`                         | SecKB Python interpreter path                    |
| `GHIDRA_INSTALL_DIR`                   | Ghidra install directory                         |
| `JINA_API_KEY`                         | Jina AI API key                                  |
| `BRAVE_API_KEY`                        | Brave Search API key                             |
| `CTF_ALLOWED_ROOTS`                    | Extra allowed filesystem roots                   |
| `CTF_ALLOWED_HOSTS`                    | Extra allowed private/lab hosts                  |
| `OPENCODE_CONFIG_DIR`                  | Override OpenCode config directory               |
| `OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS` | Install external skills snapshot when set to `1` |

## Development

- Node.js >= 22.20.0
- `npm run check` - typecheck + content validation + tests
- `npm run doctor` - managed install doctor
- `npm run build:plugin` / `npm run release:check` / `npm run pack:check` for release shape

## Packages

| Package                | Role                                           |
| ---------------------- | ---------------------------------------------- |
| `ctf-core`             | Shared types, scoring, category router         |
| `ctf-notes-core`       | Notes / state templates                        |
| `ctf-rules-engine`     | Rules helpers                                  |
| `ctf-benchmark-core`   | Benchmark definitions                          |
| `ctf-adapter-opencode` | OpenCode product constants + router re-exports |

Plugin hooks and installers live in repo-root `src/` and `scripts/`. The adapter package is only a thin harness-facing surface.
